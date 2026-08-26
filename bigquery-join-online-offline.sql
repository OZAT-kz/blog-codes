// ==============================================================================
// bigquery-join-online-offline.sql
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery-join-online-offline.sql
// ==============================================================================


WITH online_sessions AS (
  -- Юзер логин жасаған Google Ads сессияларын аламыз (user_id бар)
  SELECT 
    user_id AS hashed_phone,
    CONCAT(user_pseudo_id, (SELECT value.int_value FROM UNNEST(event_params) WHERE key = 'ga_session_id')) AS session_id,
    TIMESTAMP_MICROS(event_timestamp) AS session_time,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') AS utm_source,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'medium') AS utm_medium,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign') AS utm_campaign
  FROM 
    `your-project.analytics_123456789.events_*`
  WHERE 
    user_id IS NOT NULL 
    AND event_name = 'session_start'
),

offline_transactions AS (
  -- Біздің офлайн транзакцияларымызды аламыз
  SELECT 
    transaction_id,
    hashed_phone,
    revenue,
    transaction_date
  FROM 
    `your-project.crm_data.offline_sales`
)

-- Желімдейміз!
SELECT 
  o.transaction_id,
  o.revenue,
  o.transaction_date,
  s.utm_campaign,
  s.session_time
FROM 
  offline_transactions o
JOIN 
  online_sessions s ON o.hashed_phone = s.hashed_phone
WHERE
  -- Сатып алу сайтқа кіргеннен КЕЙІН болды
  o.transaction_date > s.session_time
  -- Атрибуция терезесі (мысалы, 7 күн)
  AND TIMESTAMP_DIFF(o.transaction_date, s.session_time, DAY) <= 7
  AND s.utm_source = 'google' 
  AND s.utm_medium = 'cpc'
-- Сатып алу алдындағы тек соңғы кликті аламыз (Last Non-Direct Click)
QUALIFY ROW_NUMBER() OVER(PARTITION BY o.transaction_id ORDER BY s.session_time DESC) = 1;
