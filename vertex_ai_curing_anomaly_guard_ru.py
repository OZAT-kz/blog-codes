# ==============================================================================
# Казы без риска: IoT-мониторинг созревания мяса и сыра на ESP32 с Cloud Run MQTT и Vertex AI Time-Series Detection
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_curing_anomaly_guard_ru.py
# ==============================================================================

import os
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List
from fastapi import FastAPI, HTTPException
from google.cloud import firestore
from google.cloud import aiplatform
import numpy as np
import telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [CURING-AI] %(message)s")
logger = logging.getLogger("curing_anomaly_guard")

app = FastAPI(title="Kazy & Cheese Curing Anomaly Guard")

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "ozat-meat-iot-prod")
LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
ENDPOINT_ID = os.getenv("VERTEX_ENDPOINT_ID", "projects/123456789/locations/us-central1/endpoints/curing_autoencoder_v2")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_OWNER_CHAT_ID = os.getenv("TELEGRAM_OWNER_CHAT_ID", "123456789")

db = firestore.AsyncClient(project=PROJECT_ID)
aiplatform.init(project=PROJECT_ID, location=LOCATION)
endpoint = aiplatform.Endpoint(ENDPOINT_ID) if ENDPOINT_ID else None
bot = telegram.Bot(token=TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

TARGET_PROFILES = {
    "kazy_zhaya_gruyere": {
        "min_temp": 12.0,
        "max_temp": 13.5,
        "min_humidity": 74.0,
        "max_humidity": 78.0,
        "max_dt_per_min": 0.15,   # °C / мин
        "max_drh_per_min": -0.80  # % RH / мин (признак обледенения радиатора)
    }
}

async def calculate_derivatives(chamber_id: str, current_temp: float, current_hum: float, current_epoch: int):
    """Вычисляет производные dT/dt и dRH/dt по последним 6 точкам (1 минута) из Firestore"""
    query = (
        db.collection("chambers_telemetry")
        .where("chamber_id", "==", chamber_id)
        .order_by("timestamp_epoch", direction=firestore.Query.DESCENDING)
        .limit(6)
    )
    docs = await query.get()
    
    if len(docs) < 3:
        return 0.0, 0.0 # Недостаточно данных для аппроксимации
        
    timestamps = [d.to_dict().get("timestamp_epoch", current_epoch) for d in docs]
    temps = [d.to_dict().get("temperature", current_temp) for d in docs]
    hums = [d.to_dict().get("humidity", current_hum) for d in docs]
    
    # Линейный регрессионный наклон (производная в единицу времени - минута)
    dt_seconds = np.array(timestamps) - timestamps[-1]
    if dt_seconds[0] == 0:
        return 0.0, 0.0
        
    dt_minutes = dt_seconds / 60.0
    poly_t = np.polyfit(dt_minutes, temps, 1)
    poly_rh = np.polyfit(dt_minutes, hums, 1)
    
    dT_dt = float(poly_t[0])
    dRH_dt = float(poly_rh[0])
    return round(dT_dt, 3), round(dRH_dt, 3)

async def send_emergency_alert(chamber_id: str, alert_text: str, anomaly_score: float, dT_dt: float, dRH_dt: float, is_critical: bool):
    if not bot or not TELEGRAM_OWNER_CHAT_ID:
        return
        
    icon = "🚨 <b>КРИТИЧЕСКИЙ СБОЙ HACCP</b>" if is_critical else "⚠️ <b>ПРЕДИКТИВНАЯ АНОМАЛИЯ (Vertex AI)</b>"
    msg = (
        f"{icon}\n\n"
        f"🥩 Камера: <b>{chamber_id}</b>\n"
        f"{alert_text}\n"
        f"📈 Динамика: <code>dT/dt = {dT_dt:+.2f}°C/мин</code>, <code>dRH/dt = {dRH_dt:+.2f}%/мин</code>\n"
        f"📊 Anomaly Reconstruction Error: <code>{anomaly_score:.3f}</code> (порог: 0.720)\n"
        f"💰 Риск потери партии: <b>2 500 000 ₸</b>\n"
        f"🕒 Время: <i>{datetime.now(timezone(timedelta(hours=5))).strftime('%H:%M:%S')} (Алматы)</i>"
    )
    try:
        await bot.send_message(chat_id=TELEGRAM_OWNER_CHAT_ID, text=msg, parse_mode=telegram.constants.ParseMode.HTML)
    except Exception as e:
        logger.error(f"Telegram error: {e}")

@app.post("/api/v1/telemetry/ingest")
async def ingest_telemetry(payload: Dict[str, Any]):
    chamber_id = payload.get("chamber_id", "unknown")
    temp = payload.get("temperature")
    humidity = payload.get("humidity")
    epoch = payload.get("timestamp_epoch", int(datetime.now().timestamp()))
    product = payload.get("target_product", "kazy_zhaya_gruyere")
    
    if temp is None or humidity is None:
        raise HTTPException(status_code=400, detail="Invalid telemetry values")
        
    # 1. Расчет производных скорости изменения физических величин
    dT_dt, dRH_dt = await calculate_derivatives(chamber_id, temp, humidity, epoch)
    
    # 2. Запись точки в Cloud Firestore
    await db.collection("chambers_telemetry").add({
        "chamber_id": chamber_id,
        "temperature": temp,
        "humidity": humidity,
        "dT_dt": dT_dt,
        "dRH_dt": dRH_dt,
        "timestamp_epoch": epoch,
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    # 3. Инференс на модели временных рядов в Vertex AI Prediction
    # Формируем вектор признаков: [T, RH, dT_dt, dRH_dt, hour_of_day, is_night]
    hour = datetime.fromtimestamp(epoch, tz=timezone(timedelta(hours=5))).hour
    feature_vector = [float(temp), float(humidity), float(dT_dt), float(dRH_dt), float(hour), 1.0 if (hour < 6 or hour > 22) else 0.0]
    
    anomaly_score = 0.0
    if endpoint:
        try:
            prediction = endpoint.predict(instances=[feature_vector])
            # Autoencoder Reconstruction MSE
            anomaly_score = float(prediction.predictions[0].get("reconstruction_error", 0.0))
        except Exception as e:
            logger.warning(f"Vertex AI inference fallback to statistical rule: {e}")
            # Heuristic Fallback
            anomaly_score = (abs(temp - 12.5) / 2.0) * 0.5 + (abs(humidity - 76.0) / 4.0) * 0.5
    else:
        anomaly_score = (abs(temp - 12.5) / 2.0) * 0.5 + (abs(humidity - 76.0) / 4.0) * 0.5

    profile = TARGET_PROFILES.get(product, TARGET_PROFILES["kazy_zhaya_gruyere"])
    
    # 4. Классификация инцидентов
    if temp < profile["min_temp"] or temp > profile["max_temp"] or humidity < profile["min_humidity"] or humidity > profile["max_humidity"]:
        await send_emergency_alert(
            chamber_id=chamber_id,
            alert_text=f"• Температура: <b>{temp}°C</b> (Норма: 12.0–13.5°C)\n• Влажность: <b>{humidity}%</b> (Норма: 74–78%)\n<i>Угроза закала корки казы и пересушивания сыра!</i>",
            anomaly_score=anomaly_score,
            dT_dt=dT_dt,
            dRH_dt=dRH_dt,
            is_critical=True
        )
    elif dRH_dt <= profile["max_drh_per_min"] or anomaly_score > 0.72:
        # Предиктивное предупреждение: резкое падение влажности при нормальной температуре - обледенение ламелей испарителя
        await send_emergency_alert(
            chamber_id=chamber_id,
            alert_text=f"• <b>Ранний симптом обледенения радиатора</b>\n• Скорость осушения: {dRH_dt}%/мин\n<i>Рекомендация: запустить ручной цикл оттайки испарителя.</i>",
            anomaly_score=anomaly_score,
            dT_dt=dT_dt,
            dRH_dt=dRH_dt,
            is_critical=False
        )
        
    return {"status": "ok", "anomaly_score": round(anomaly_score, 3), "dT_dt": dT_dt, "dRH_dt": dRH_dt}
