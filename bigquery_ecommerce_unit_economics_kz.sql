-- ==============================================================================
-- 500 мың теңгенің дашборды: Скаут Looker Studio мен Cloud Functions арқылы селлерге өтпелі аналитиканы қалай жинай алады
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ecommerce_unit_economics_kz.sql
-- ==============================================================================

-- Өтпелі аналитикаға арналған деректер витринасы (Юнит-экономика)
CREATE OR REPLACE VIEW `ozatkz-project.ecommerce_mart.unit_economics` AS
SELECT
  o.order_id,
  o.created_at AS order_date,
  o.status,
  o.total_amount AS revenue,
  COALESCE(c.cogs_amount, 0) AS cogs, -- Қоймалық жүйеден алынған тауардың өзіндік құны
  (o.total_amount * 0.12) AS marketplace_commission, -- Маркетплейстің 12% комиссиясы (мысал)
  COALESCE(a.ad_spend_attributed, 0) AS ad_spend, -- Атрибутталған жарнама шығындары
  
  -- Жалпы және таза пайданы есептейміз
  (o.total_amount - COALESCE(c.cogs_amount, 0)) AS gross_profit,
  (o.total_amount - COALESCE(c.cogs_amount, 0) - (o.total_amount * 0.12) - COALESCE(a.ad_spend_attributed, 0)) AS net_profit

FROM
  `ozatkz-project.ecommerce_raw.crm_orders` o
LEFT JOIN
  `ozatkz-project.ecommerce_raw.inventory_cogs` c ON o.sku_id = c.sku_id
LEFT JOIN
  `ozatkz-project.ecommerce_raw.marketing_attribution` a ON o.order_id = a.order_id
WHERE
  o.status IN ('DELIVERED', 'COMPLETED');
