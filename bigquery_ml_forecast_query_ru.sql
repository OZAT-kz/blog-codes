-- ==============================================================================
-- «Гадание на кофейной гуще vs BigQuery ML»: Как кофейне перестать выкидывать круассаны и предсказывать спрос
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bigquery_ml_forecast_query_ru.sql
-- ==============================================================================

-- Получаем прогноз на следующие 3 дня
SELECT
  product_id,
  CAST(forecast_timestamp AS DATE) AS target_date,
  ROUND(forecast_value) AS predicted_quantity,
  ROUND(prediction_interval_lower_bound) AS min_expected,
  ROUND(prediction_interval_upper_bound) AS max_expected
FROM
  ML.FORECAST(
    MODEL `ozatkz-project.coffee_shop.bakery_demand_model`,
    STRUCT(3 AS horizon, 0.9 AS confidence_level)
  )
WHERE
  CAST(forecast_timestamp AS DATE) = DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY);
