# ==============================================================================
# earth_engine_crop_ndvi_pipeline_kz.py
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/earth_engine_crop_ndvi_pipeline_kz.py
# ==============================================================================

import ee
import datetime

# Initialize Earth Engine with GCP Service Account credentials
def initialize_gee(service_account_email: str, key_file_path: str, project_id: str):
    credentials = ee.ServiceAccountCredentials(service_account_email, key_file_path)
    ee.Initialize(credentials, project=project_id)
    print(f"✅ GEE initialized successfully for project: {project_id}")

def mask_s2_clouds(image):
    """
    Cloud masking using Sentinel-2 Scene Classification Layer (SCL)
    and QA60 Cloud/Cirrus bitmask flags.
    """
    qa = image.select('QA60')
    scl = image.select('SCL')
    
    cloud_bit_mask = 1 << 10
    cirrus_bit_mask = 1 << 11
    
    qa_mask = qa.bitwiseAnd(cloud_bit_mask).eq(0).And(qa.bitwiseAnd(cirrus_bit_mask).eq(0))
    # SCL values: 4 = vegetation, 5 = bare soil, 6 = water, 7 = unclassified
    scl_mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    
    return image.updateMask(qa_mask).updateMask(scl_mask).divide(10000)

def compute_vegetation_indices(image):
    """
    Computes NDVI (Biomass), NDWI (Canopy Moisture), and EVI (Atmospheric Corrected)
    """
    # Bands: B2=Blue, B3=Green, B4=Red, B8=NIR, B11=SWIR1, B12=SWIR2
    nir = image.select('B8')
    red = image.select('B4')
    blue = image.select('B2')
    swir = image.select('B11')
    
    # 1. NDVI = (NIR - RED) / (NIR + RED)
    ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI')
    
    # 2. NDWI (Gao Moisture) = (NIR - SWIR) / (NIR + SWIR)
    ndwi = nir.subtract(swir).divide(nir.add(swir)).rename('NDWI')
    
    # 3. EVI = 2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))
    evi = image.expression(
        '2.5 * ((NIR - RED) / (NIR + 6.0 * RED - 7.5 * BLUE + 1.0))',
        {'NIR': nir, 'RED': red, 'BLUE': blue}
    ).rename('EVI')
    
    return image.addBands([ndvi, ndwi, evi]).set('date', image.date().format('YYYY-MM-dd'))

def process_region_zonal_stats(farm_polygons_fc, start_date: str, end_date: str, bq_export_table: str):
    """
    Extracts mean zonal statistics for all crop fields in Kostanay & Akmola
    and streams metrics to BigQuery GIS.
    """
    s2_collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                     .filterBounds(farm_polygons_fc)
                     .filterDate(start_date, end_date)
                     .map(mask_s2_clouds)
                     .map(compute_vegetation_indices))
    
    # Create 10-day median composite to eliminate lingering cloud artifacts
    composite = s2_collection.select(['NDVI', 'NDWI', 'EVI']).median()
    
    # Compute zonal reduction over field geometries
    zonal_stats = composite.reduceRegions(
        collection=farm_polygons_fc,
        reducer=ee.Reducer.mean().combine(
            reducer2=ee.Reducer.stdDev(),
            sharedInputs=True
        ),
        scale=10,
        crs='EPSG:4326'
    )
    
    task = ee.batch.Export.table.toBigQuery(
        collection=zonal_stats,
        description=f'wheat_indices_{start_date}_{end_date}',
        outputTable=bq_export_table,
        writeDisposition='WRITE_APPEND'
    )
    task.start()
    print(f"🚀 Dispatched GEE Batch Task ID: {task.id} -> BigQuery: {bq_export_table}")
    return task.id