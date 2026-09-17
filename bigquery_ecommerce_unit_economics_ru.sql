-- ==============================================================================
-- Дашборд за 500 тысяч тенге: Как Скауту собрать сквозную аналитику для селлера, используя Looker Studio и Cloud Functions
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ecommerce_unit_economics_ru.sql
-- ==============================================================================

-- Витрина данных для сквозной аналитики (Юнит-экономика)
CREATE OR REPLACE VIEW `ozatkz-project.ecommerce_mart.unit_economics` AS
SELECT
  o.order_id,
  o.created_at AS order_date,
  o.status,
  o.total_amount AS revenue,
  COALESCE(c.cogs_amount, 0) AS cogs, -- Себестоимость товара из складской системы
  (o.total_amount * 0.12) AS marketplace_commission, -- 12% комиссия маркетплейса (пример)
  COALESCE(a.ad_spend_attributed, 0) AS ad_spend, -- Атрибутированные рекламные расходы
  
  -- Считаем валовую и чистую прибыль
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
