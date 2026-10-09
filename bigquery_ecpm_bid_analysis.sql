-- ==============================================================================
-- Анатомия AdTech-арбитража в Алматы: как инфлюенсерам выжать максимальный CPC (до 450 ₸ за клик), стравив Google Ad Manager и РСЯ через Prebid.js на Google Cloud
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ecpm_bid_analysis.sql
-- ==============================================================================

SELECT
  DATE(event_timestamp) AS auction_date,
  traffic_source,
  geo_city,
  COUNT(1) AS total_ad_impressions,
  ROUND(AVG(winning_bid_usd) * 1000, 2) AS calculated_ecpm_usd,
  ROUND(AVG(cpc_value_kzt), 1) AS avg_cpc_kzt,
  ROUND(SUM(CASE WHEN winning_bidder = 'google_dynamic_allocation' THEN 1 ELSE 0 END) * 100.0 / COUNT(1), 1) AS google_win_share_pct,
  ROUND(SUM(CASE WHEN winning_bidder = 'yandex_rsya' THEN 1 ELSE 0 END) * 100.0 / COUNT(1), 1) AS yandex_win_share_pct,
  ROUND(SUM(estimated_revenue_usd) * 500.0, 0) AS total_daily_revenue_kzt
FROM
  `ozat-open-datasets.ozat_cloud_knowledge_hub.adtech_auction_events`
WHERE
  event_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
  AND country_code = 'KZ'
GROUP BY
  auction_date,
  traffic_source,
  geo_city
ORDER BY
  auction_date DESC,
  total_daily_revenue_kzt DESC;
