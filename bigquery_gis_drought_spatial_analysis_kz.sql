-- ==============================================================================
-- ЖИ 5 000 000 гектар бидайды құтқарады: Google Earth Engine және BigQuery GIS арқылы Қостанай мен Ақмоладағы құрғақшылықты ғарыштық бақылау
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_gis_drought_spatial_analysis_kz.sql
-- ==============================================================================

WITH CadastralFields AS (
  SELECT 
    field_id,
    cadastre_number,
    region_name,       -- 'Костанайская область', 'Акмолинская область', 'СКО'
    district_name,     -- 'Федоровский', 'Зерендинский', 'Атбасарский'
    crop_type,         -- 'Яровая мягкая пшеница'
    sowing_date,
    field_polygon_geo  -- GEOGRAPHY WKT polygon
  FROM `ozat-agritech.cadastre.kazakhstan_grain_belt_fields`
  WHERE ST_AREA(field_polygon_geo) > 100000 -- Исключаем тестовые участки < 10 га
),

SatelliteTelemetry AS (
  SELECT 
    field_id,
    observation_date,
    AVG(ndvi_mean) AS current_ndvi,
    AVG(ndwi_mean) AS current_ndwi,
    AVG(evi_mean) AS current_evi
  FROM `ozat-agritech.satellite.sentinel2_zonal_stats`
  WHERE observation_date BETWEEN '2026-06-01' AND '2026-07-31'
  GROUP BY field_id, observation_date
),

HistoricalBaseline AS (
  -- 10-летний ретроспективный бенчмарк вегетации для каждого полигона
  SELECT 
    field_id,
    EXTRACT(DAYOFYEAR FROM observation_date) AS day_of_year,
    AVG(ndvi_mean) AS baseline_ndvi_10yr,
    STDDEV(ndvi_mean) AS stddev_ndvi_10yr
  FROM `ozat-agritech.satellite.sentinel2_zonal_historical_2016_2025`
  GROUP BY field_id, day_of_year
),

SoilMoistureAndWeather AS (
  -- Сопряжение с метеостанциями Казгидромет и сеткой ERA5-Land
  SELECT 
    c.field_id,
    AVG(e.soil_temperature_layer1_celsius) AS soil_temp,
    AVG(e.volumetric_soil_water_layer1_percent) AS soil_moisture_pct,
    SUM(e.precipitation_mm) AS cum_precip_14d
  FROM CadastralFields c
  CROSS JOIN `ozat-agritech.weather.era5_land_daily` e
  WHERE ST_CONTAINS(e.grid_cell_geo, ST_CENTROID(c.field_polygon_geo))
    AND e.date BETWEEN DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY) AND CURRENT_DATE()
  GROUP BY c.field_id
)

SELECT 
  c.field_id,
  c.cadastre_number,
  c.region_name,
  c.district_name,
  c.crop_type,
  ST_AREA(c.field_polygon_geo) / 10000.0 AS area_hectares,
  s.observation_date,
  s.current_ndvi,
  s.current_ndwi,
  h.baseline_ndvi_10yr,
  -- Z-Score вегетационной аномалии (индекс деградации биомассы)
  SAFE_DIVIDE((s.current_ndvi - h.baseline_ndvi_10yr), NULLIF(h.stddev_ndvi_10yr, 0)) AS ndvi_z_score,
  w.soil_moisture_pct,
  w.cum_precip_14d,
  -- Оценка риска атмосферно-почвенной засухи (Drought Severity Index)
  CASE 
    WHEN s.current_ndwi < 0.15 AND w.soil_moisture_pct < 12.0 AND (s.current_ndvi - h.baseline_ndvi_10yr) < -0.18 THEN 'CRITICAL_DROUGHT'
    WHEN s.current_ndwi < 0.25 AND w.soil_moisture_pct < 16.0 THEN 'WARNING_MOISTURE_STRESS'
    WHEN s.current_ndvi >= h.baseline_ndvi_10yr THEN 'HEALTHY_OPTIMAL'
    ELSE 'MODERATE_MONITORING'
  END AS agronomic_risk_level,
  -- Предиктивный прогноз урожайности (ц/га)
  GREATEST(4.0, (18.5 + (s.current_ndvi * 12.0) + (w.soil_moisture_pct * 0.35) - (2.5 * GREATEST(0, (28.0 - w.soil_moisture_pct))))) AS forecasted_yield_centner_ha
FROM CadastralFields c
JOIN SatelliteTelemetry s ON c.field_id = s.field_id
JOIN HistoricalBaseline h ON c.field_id = h.field_id 
  AND EXTRACT(DAYOFYEAR FROM s.observation_date) = h.day_of_year
JOIN SoilMoistureAndWeather w ON c.field_id = w.field_id
WHERE s.observation_date = (SELECT MAX(observation_date) FROM SatelliteTelemetry)
ORDER BY area_hectares DESC;
