// ==============================================================================
// bigquery_gis_logistics_kz.sql
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_gis_logistics_kz.sql
// ==============================================================================

WITH ValidDeliveries AS (
  SELECT
    order_id,
    courier_id,
    ST_GEOGPOINT(longitude, latitude) AS geo_point,
    delivery_timestamp,
    EXTRACT(DAYOFWEEK FROM delivery_timestamp) AS day_of_week,
    TIMESTAMP_DIFF(delivery_timestamp, created_timestamp, MINUTE) AS delivery_time_minutes
  FROM
    `ozat-kz-analytics.logistics.completed_orders`
  WHERE
    delivery_status = 'SUCCESS'
    AND delivery_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
    -- Отсекаем GPS-аномалии: берем только точки в радиусе 50 км от центра Алматы
    AND ST_DISTANCE(ST_GEOGPOINT(longitude, latitude), ST_GEOGPOINT(76.9286, 43.2567)) < 50000 
),
ClusteredHotspots AS (
  SELECT
    order_id,
    geo_point,
    day_of_week,
    delivery_time_minutes,
    -- Магия DBSCAN: Кластеризуем точки доставки (радиус 400 метров, минимум 15 заказов)
    -- Партиционируем по дню недели, так как паттерны в будни и выходные разные
    ST_CLUSTERDBSCAN(geo_point, 400, 15) OVER (PARTITION BY day_of_week) AS cluster_id
  FROM
    ValidDeliveries
)
SELECT
  cluster_id,
  day_of_week,
  COUNT(order_id) AS total_orders,
  AVG(delivery_time_minutes) AS avg_delivery_time,
  -- Вычисляем геометрический центр кластера (центроид) для стоянки курьера
  ST_CENTROID_AGG(geo_point) AS cluster_center,
  -- Очерчиваем реальный полигон (границы кластера) вместо статичных зон
  ST_CONVEXHULL(ST_UNION_AGG(geo_point)) AS cluster_polygon
FROM
  ClusteredHotspots
WHERE
  cluster_id IS NOT NULL
GROUP BY
  cluster_id, day_of_week
ORDER BY
  total_orders DESC;