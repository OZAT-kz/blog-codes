-- ==============================================================================
-- Алматинские пробки vs BigQuery: Как мы анализировали 1 000 000 маршрутов курьеров и оптимизировали локальную рекламу
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_traffic_polygon.sql
-- ==============================================================================

-- Создаем полигон пробки
SELECT
  ST_CONVEXHULL(ST_UNION_AGG(geo_point)) as traffic_jam_polygon,
  COUNT(DISTINCT courier_id) as stuck_couriers_count
FROM clustered_data
WHERE cluster_id IS NOT NULL
GROUP BY cluster_id;
