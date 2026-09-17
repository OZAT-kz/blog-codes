-- ==============================================================================
-- «Гадание на кофейной гуще vs BigQuery ML»: Как кофейне перестать выкидывать круассаны и предсказывать спрос
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ml_arima_croissant_ru.sql
-- ==============================================================================

-- Создаем модель машинного обучения прямо в базе данных
CREATE OR REPLACE MODEL `ozatkz-project.coffee_shop.bakery_demand_model`
OPTIONS(
  model_type='ARIMA_PLUS',
  time_series_timestamp_col='sales_date',
  time_series_data_col='quantity_sold',
  time_series_id_col='product_id', -- Обучаем сразу для всех видов выпечки!
  data_frequency='DAILY',
  auto_arima=TRUE,
  holiday_region='KZ' -- Учитываем казахстанские праздники автоматически
) AS
SELECT
  DATE(transaction_timestamp) AS sales_date,
  product_id,
  SUM(quantity) AS quantity_sold
FROM
  `ozatkz-project.coffee_shop.pos_transactions`
WHERE
  category = 'Bakery'
  AND transaction_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 365 DAY)
GROUP BY
  sales_date, product_id;
