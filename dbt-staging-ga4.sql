-- ==============================================================================
-- Looker Studio тормозит, а счет за BigQuery пугает финдиректора? Архитектура идеального дашборда для CMO
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dbt-staging-ga4.sql
-- ==============================================================================

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
