-- ==============================================================================
-- AdSense в Казахстане приносит копейки? Как мы сделали x3 к RPM, скормив GA4 Predictive Audiences в Google Ad Manager
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/ga4_propensity_score_ru.sql
-- ==============================================================================

-- Расчет кастомного индекса вовлеченности (Propensity Score) в BigQuery
-- Анализируем сырые логи GA4 для выявления Premium-пользователей
WITH UserActivity AS (
  SELECT
    user_pseudo_id,
    COUNT(DISTINCT event_date) AS active_days,
    SUM(CASE WHEN event_name = 'scroll' THEN 1 ELSE 0 END) AS deep_scrolls,
    SUM(CASE WHEN event_name = 'session_start' THEN 1 ELSE 0 END) AS total_sessions,
    -- Считаем общее время на сайте (в минутах)
    SUM(engagement_time_msec) / 60000 AS total_engagement_minutes
  FROM
    `ozat-kz-analytics.analytics_123456789.events_*`
  WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)) 
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  GROUP BY
    user_pseudo_id
)

SELECT
  user_pseudo_id,
  active_days,
  total_engagement_minutes,
  -- Формируем скоринг. Веса подобраны на основе исторической корреляции с кликабельностью (CTR)
  (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) AS propensity_score,
  
  -- Размечаем сегменты
  CASE 
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) > 50 THEN 'premium_reader'
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) BETWEEN 20 AND 50 THEN 'engaged_reader'
    ELSE 'casual_reader'
  END AS audience_segment
FROM
  UserActivity
ORDER BY
  propensity_score DESC;
