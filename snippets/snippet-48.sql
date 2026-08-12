// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

-- Пример dbt-модели для извлечения параметров GA4 (Staging)
SELECT
  event_date,
  event_timestamp,
  event_name,
  user_pseudo_id AS client_id,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'campaign') AS utm_campaign,
  (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'source') AS utm_source
FROM
  {{ source('google_analytics', 'events') }}
WHERE
  _TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', CURRENT_DATE())
