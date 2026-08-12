// ==============================================================================
// dbt model for aggregating user features
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dbt-user-features.sql
// ==============================================================================


-- Пайдаланушы фичаларын агрегациялауға арналған dbt моделі
SELECT 
  user_pseudo_id AS client_id,
  COUNT(event_name) AS total_events,
  SUM(CASE WHEN event_name = \'view_item\' THEN 1 ELSE 0 END) AS layout_views,
  SUM(CASE WHEN event_name = \'calculator_use\' THEN 1 ELSE 0 END) AS calculator_uses,
  TIMESTAMP_DIFF(MAX(event_timestamp), MIN(event_timestamp), SECOND) AS session_duration_seconds,
  device.category AS device_category,
  device.mobile_brand_name AS phone_brand
FROM 
  `project.analytics_123456789.events_*`
GROUP BY 
  client_id,
  device_category,
  phone_brand
