// ==============================================================================
// BigQuery ішіндегі Propensity Score есептеу
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/ga4_propensity_score_kz.sql
// ==============================================================================

-- BigQuery-де кастомды тартылу индексін (Propensity Score) есептеу
-- Premium-пайдаланушыларды анықтау үшін GA4 шикі логтарын талдаймыз
WITH UserActivity AS (
  SELECT
    user_pseudo_id,
    COUNT(DISTINCT event_date) AS active_days,
    SUM(CASE WHEN event_name = 'scroll' THEN 1 ELSE 0 END) AS deep_scrolls,
    SUM(CASE WHEN event_name = 'session_start' THEN 1 ELSE 0 END) AS total_sessions,
    -- Сайттағы жалпы уақытты есептейміз (минутпен)
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
  -- Скорингті қалыптастырамыз. Салмақтар басылуға (CTR) тарихи корреляция негізінде таңдалған
  (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) AS propensity_score,
  
  -- Сегменттерді белгілейміз
  CASE 
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) > 50 THEN 'premium_reader'
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) BETWEEN 20 AND 50 THEN 'engaged_reader'
    ELSE 'casual_reader'
  END AS audience_segment
FROM
  UserActivity
ORDER BY
  propensity_score DESC;