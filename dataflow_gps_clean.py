# ==============================================================================
# dataflow_gps_clean.py
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dataflow_gps_clean.py
# ==============================================================================


# Dataflow (Apache Beam) құбырының фрагменті
import apache_beam as beam
import json

def parse_and_clean_gps(message):
    data = json.loads(message)
    # GPS аномалияларын сүзу (мысалы, Қапшағайдағы нүктелерді алып тастау)
    if 43.0 < data['lat'] < 43.6 and 76.6 < data['lon'] < 77.2:
        yield data

(p 
 | 'ReadFromPubSub' >> beam.io.ReadFromPubSub(subscription='projects/ozat-kz/subscriptions/gps-sub')
 | 'CleanData' >> beam.FlatMap(parse_and_clean_gps)
 | 'WriteToBigQuery' >> beam.io.WriteToBigQuery(
       table='ozat-kz:traffic_dataset.raw_gps',
       create_disposition=beam.io.BigQueryDisposition.CREATE_NEVER,
       write_disposition=beam.io.BigQueryDisposition.WRITE_APPEND
   )
)
