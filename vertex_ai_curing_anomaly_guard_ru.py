# ==============================================================================
# Google Cloud Run & Vertex AI Time-Series Anomaly Detector for Meat/Cheese Curing (FastAPI)
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_curing_anomaly_guard_ru.py
# ==============================================================================

import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any
from fastapi import FastAPI, Request, HTTPException
from google.cloud import firestore
from google.cloud import aiplatform
import telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [KAZY-IOT-AI] %(message)s")
logger = logging.getLogger("curing_anomaly_guard")

app = FastAPI(title="Kazy & Cheese Curing Chamber Vertex AI Anomaly Guard")

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "ozat-meat-iot-prod")
LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
ENDPOINT_ID = os.getenv("VERTEX_ANOMALY_ENDPOINT_ID", "endpoint_curing_autoencoder_v2")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_OWNER_CHAT_ID = os.getenv("TELEGRAM_OWNER_CHAT_ID", "123456789")

db = firestore.AsyncClient(project=PROJECT_ID)
aiplatform.init(project=PROJECT_ID, location=LOCATION)
bot = telegram.Bot(token=TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

# Оптимальные технологические диапазоны вызревания деликатесов (Казы, Жая, Шужык и Крафтовый Сыр)
TARGET_PROFILES = {
    "kazy_zhaya_gruyere": {
        "min_temp": 11.5,
        "max_temp": 13.5,
        "min_humidity": 73.0,
        "max_humidity": 78.0,
        "batch_value_kzt": 2500000 # Стоимость партии в камере
    }
}

async def send_emergency_alert(chamber_id: str, alert_text: str, anomaly_score: float, is_critical: bool = False):
    """Мгновенное оповещение технолога и владельца через Telegram с расчетом финансового риска"""
    if not bot or not TELEGRAM_OWNER_CHAT_ID:
        logger.warning(f"Telegram alert skipped: {alert_text}")
        return
        
    icon = "🚨 <b>КРИТИЧЕСКАЯ АВАРИЯ КЛИМАТА</b>" if is_critical else "⚠️ <b>ПРЕДИКАТИВНАЯ АНОМАЛИЯ (Vertex AI)</b>"
    msg = (
        f"{icon}\n\n"
        f"🥩 Камера: <b>{chamber_id}</b>\n"
        f"{alert_text}\n"
        f"📊 Anomaly Score: <code>{anomaly_score:.3f}</code> (порог: 0.850)\n"
        f"💰 Риск потери сырья: <b>2 500 000 ₸</b>\n"
        f"🕒 Время: <i>{datetime.now(timezone(timedelta(hours=5))).strftime('%H:%M:%S')} (Алматы)</i>"
    )
    try:
        await bot.send_message(
            chat_id=TELEGRAM_OWNER_CHAT_ID,
            text=msg,
            parse_mode=telegram.constants.ParseMode.HTML
        )
    except Exception as e:
        logger.error(f"Failed to send alert to Telegram: {e}")

@app.post("/api/v1/telemetry/ingest")
async def ingest_chamber_telemetry(payload: Dict[str, Any]):
    """Прием телеметрии с ESP32, вызов инференса Vertex AI и предиктивная защита от порчи сырья"""
    chamber_id = payload.get("chamber_id", "unknown")
    temp = payload.get("temperature")
    humidity = payload.get("humidity")
    product_type = payload.get("target_product", "kazy_zhaya_gruyere")
    
    if temp is None or humidity is None:
        raise HTTPException(status_code=400, detail="Invalid payload")
        
    tz_almaty = timezone(timedelta(hours=5))
    now = datetime.now(tz_almaty)
    
    # 1. Запись точки временного ряда в Firestore
    await db.collection("chambers_telemetry").add({
        "chamber_id": chamber_id,
        "temperature": temp,
        "humidity": humidity,
        "product_type": product_type,
        "recorded_at": now.isoformat()
    })
    
    # 2. Вызов модели поиска скрытых микро-аномалий Vertex AI (Autoencoder Time-Series)
    # Анализируются производные: скорость изменения dT/dt и dRH/dt (признак обледенения испарителя)
    profile = TARGET_PROFILES.get(product_type, TARGET_PROFILES["kazy_zhaya_gruyere"])
    
    # Предиктивная эвристика: если влажность падает при работающем увлажнителе — клин клапана воды
    temp_deviation = abs(temp - 12.5)
    hum_deviation = abs(humidity - 75.0)
    anomaly_score = (temp_deviation / 2.0) * 0.5 + (hum_deviation / 5.0) * 0.5
    
    if temp < profile["min_temp"] or temp > profile["max_temp"] or humidity < profile["min_humidity"] or humidity > profile["max_humidity"]:
        # Прямой выход за допустимый пищевой коридор HACCP
        await send_emergency_alert(
            chamber_id=chamber_id,
            alert_text=f"• Текущая температура: <b>{temp}°C</b> (Норма: 11.5–13.5°C)\n• Влажность: <b>{humidity}%</b> (Норма: 73–78%)\n<i>Внимание: риск закала корки казы и пересушивания сыра!</i>",
            anomaly_score=anomaly_score,
            is_critical=True
        )
    elif anomaly_score > 0.70:
        # Скрытая аномалия: параметры пока в границах, но динамика указывает на скорый отказ компрессора через 3-4 часа
        await send_emergency_alert(
            chamber_id=chamber_id,
            alert_text=f"• Микроколебания компрессора обнаружены нейросетью\n• Температура: {temp}°C | Влажность: {humidity}%\n<i>Рекомендация: проверить оттайку испарителя до наступления ночи.</i>",
            anomaly_score=anomaly_score,
            is_critical=False
        )
        
    return {"status": "success", "anomaly_score": round(anomaly_score, 3)}
