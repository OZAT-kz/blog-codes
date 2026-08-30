-- ==============================================================================
-- Looker Studio тормозит, а счет за BigQuery пугает финдиректора? Архитектура идеального дашборда для CMO
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dbt-staging-ga4.sql
-- ==============================================================================

FROM
  {{ source('google_analytics', 'events') }}
WHERE
  _TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', CURRENT_DATE())
