// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================
-- Пример SQL-запроса для выявления бот-сессий в BigQuery
WITH session_stats AS (
  SELECT
    user_pseudo_id,
    (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id') AS session_id,
    COUNT(*) AS total_events,
    COUNTIF(event_name = 'page_view') AS pageviews,
    MIN(event_timestamp) AS first_event,
    MAX(event_timestamp) AS last_event,
    -- Флаг: сессия длилась меньше 3 секунд
    TIMESTAMP_DIFF(TIMESTAMP_MICROS(MAX(event_timestamp)), TIMESTAMP_MICROS(MIN(event_timestamp)), SECOND) < 3 AS is_too_short,
    -- Флаг: только один просмотр страницы (100% bounce)
    COUNTIF(event_name = 'page_view') = 1 AS is_single_pageview
  FROM
    `your-project.analytics_123456789.events_*`
  GROUP BY
    1, 2
)

SELECT
  user_pseudo_id,
  session_id,
  CASE 
    WHEN is_too_short AND is_single_pageview THEN 'Bot'
    WHEN total_events > 500 THEN 'Scraper' -- Аномально много событий
    ELSE 'Human'
  END AS traffic_type
FROM
  session_stats;
