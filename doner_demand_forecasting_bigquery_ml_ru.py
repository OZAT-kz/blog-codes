# ==============================================================================
# Almaty Doner Fast Food BigQuery ML ARIMA+ Demand Forecaster (RU)
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/doner_demand_forecasting_bigquery_ml_ru.py
# ==============================================================================

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List
from google.cloud import bigquery
from google.cloud import secretmanager
import requests

# Инициализация BigQuery клиента для прогнозирования спроса в общепите
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [DONER-ML] %(message)s")
logger = logging.getLogger("doner_forecasting")

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "almaty-doner-fastfood-ml")
DATASET_ID = "fastfood_analytics"
bq_client = bigquery.Client(project=PROJECT_ID)

SQL_TRAIN_ARIMA_MODEL = """
CREATE OR REPLACE MODEL `fastfood_analytics.doner_demand_arima_model`
OPTIONS(
  model_type = 'ARIMA_PLUS_XREG',
  time_series_timestamp_col = 'order_hour',
  time_series_data_col = 'doner_portions_sold',
  time_series_id_col = 'branch_id',
  auto_arima = TRUE,
  data_frequency = 'HOURLY',
  holiday_region = 'KZ'
) AS
SELECT
  TIMESTAMP_TRUNC(order_created_at, HOUR) AS order_hour,
  branch_id,
  SUM(quantity) AS doner_portions_sold,
  ANY_VALUE(is_rainy) AS is_rainy,
  ANY_VALUE(is_student_exam_period) AS is_student_exam_period,
  ANY_VALUE(is_stadium_match_day) AS is_stadium_match_day,
  ANY_VALUE(traffic_congestion_index) AS traffic_congestion_index
FROM
  `fastfood_analytics.pos_orders_enriched`
WHERE
  order_created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 180 DAY)
GROUP BY
  order_hour, branch_id;
"""

SQL_FORECAST_TOMORROW = """
SELECT
  branch_id,
  forecast_timestamp,
  ROUND(forecast_value, 0) AS predicted_portions,
  ROUND(prediction_interval_lower_bound, 0) AS safe_min_portions,
  ROUND(prediction_interval_upper_bound, 0) AS peak_max_portions
FROM
  ML.FORECAST(
    MODEL `fastfood_analytics.doner_demand_arima_model`,
    STRUCT(24 AS horizon, 0.90 AS confidence_level),
    (
      SELECT
        branch_id,
        future_hour AS order_hour,
        is_rainy,
        is_student_exam_period,
        is_stadium_match_day,
        traffic_congestion_index
      FROM
        `fastfood_analytics.future_exogenous_factors`
      WHERE
        future_hour BETWEEN TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
        AND TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
    )
  )
ORDER BY
  branch_id, forecast_timestamp ASC;
"""

def generate_morning_prep_plan(forecast_records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Расчет технологической карты заготовок мяса и лаваша на смену:
    - 1 классический донер = 120 г мяса (с учетом упека 30% требуется 172 г сырого маринованного мяса)
    - 1 донер = 1 тонкий лаваш + 10% резерв на брак/рваный лаваш
    """
    total_portions = sum(item["predicted_portions"] for item in forecast_records)
    raw_meat_kg_required = round(total_portions * 0.172, 1)
    lavash_packs_required = int(total_portions * 1.10)
    
    plan = {
        "calculated_at": datetime.utcnow().isoformat(),
        "total_predicted_doners": int(total_portions),
        "raw_chicken_meat_kg": raw_meat_kg_required,
        "lavash_units_to_defrost": lavash_packs_required,
        "peak_rush_hours": [
            item["forecast_timestamp"].strftime("%H:00") 
            for item in forecast_records if item["predicted_portions"] > 35
        ]
    }
    logger.info(f"📊 План заготовок сформирован: {plan['total_predicted_doners']} донеров, {plan['raw_chicken_meat_kg']} кг мяса, {plan['lavash_units_to_defrost']} лавашей.")
    return plan

def send_telegram_dispatch_to_kitchen(telegram_bot_token: str, chat_id: str, plan: Dict[str, Any]):
    """
    Отправка утреннего задания шеф-повару донерной в 07:00 утра.
    """
    message = (
        f"🌯 *УТРЕННИЙ ПЛАН ЗАГОТОВОК (ИИ BIGQUERY ML)*\n"
        f"📅 Смена: {datetime.now().strftime('%d.%m.%Y')}\n\n"
        f"🎯 Прогноз продаж: *{plan['total_predicted_doners']} шт.*\n"
        f"🥩 Насадить на вертел (сырое мясо): *{plan['raw_chicken_meat_kg']} кг*\n"
        f"🫓 Разморозить лаваша: *{plan['lavash_units_to_defrost']} шт.*\n"
        f"🔥 Часы пик (наплыв гостей): {', '.join(plan['peak_rush_hours']) or 'Равномерно'}\n\n"
        f"💡 _Рекомендация:_ Замариновать второй вертел к 16:30 из-за вечернего матча на стадионе!"
    )
    url = f"https://api.telegram.org/bot{telegram_bot_token}/sendMessage"
    requests.post(url, json={"chat_id": chat_id, "text": message, "parse_mode": "Markdown"})
    logger.info("✅ Утренний план отправлен в Telegram кухни.")
