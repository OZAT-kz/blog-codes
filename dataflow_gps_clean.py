# ==============================================================================
# Алматинские пробки vs BigQuery: Как мы анализировали 1 000 000 маршрутов курьеров и оптимизировали локальную рекламу
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dataflow_gps_clean.py
# ==============================================================================

# Фрагмент пайплайна Dataflow (Apache Beam)
import apache_beam as beam
import json

def parse_and_clean_gps(message):
    data = json.loads(message)
    # Фильтруем аномалии GPS (например, отстрелы в Капчагай)
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
