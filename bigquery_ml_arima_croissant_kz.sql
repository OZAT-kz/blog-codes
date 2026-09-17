-- ==============================================================================
-- «Кофе тұнбасымен бал ашу vs BigQuery ML»: Кофехана круассандарды тастауды тоқтатып, сұранысты қалай болжай алады
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ml_arima_croissant_kz.sql
-- ==============================================================================

-- Машиналық оқыту моделін тікелей деректер базасында жасаймыз
CREATE OR REPLACE MODEL `ozatkz-project.coffee_shop.bakery_demand_model`
OPTIONS(
  model_type='ARIMA_PLUS',
  time_series_timestamp_col='sales_date',
  time_series_data_col='quantity_sold',
  time_series_id_col='product_id', -- Барлық нан-тоқаш өнімдері үшін бірден оқытамыз!
  data_frequency='DAILY',
  auto_arima=TRUE,
  holiday_region='KZ' -- Қазақстандық мерекелерді автоматты түрде ескереміз
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
