# ==============================================================================
# Алматинские пробки vs BigQuery: Как мы анализировали 1 000 000 маршрутов курьеров и оптимизировали локальную рекламу
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dataflow_gps_clean.py
# ==============================================================================

| 'CleanData' >> beam.FlatMap(parse_and_clean_gps)
 | 'WriteToBigQuery' >> beam.io.WriteToBigQuery(
       table='ozat-kz:traffic_dataset.raw_gps',
       create_disposition=beam.io.BigQueryDisposition.CREATE_NEVER,
       write_disposition=beam.io.BigQueryDisposition.WRITE_APPEND
   )
)
