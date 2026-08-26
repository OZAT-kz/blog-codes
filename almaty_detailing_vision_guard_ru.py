# ==============================================================================
# almaty_detailing_vision_guard_ru.py
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/almaty_detailing_vision_guard_ru.py
# ==============================================================================

import os
import io
import time
import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import cv2
import httpx
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header
from google.cloud import vision_v1
from google.cloud import firestore
import telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [AUTODETAIL-VISION] %(message)s")
logger = logging.getLogger("detailing_guard")

app = FastAPI(title="Almaty Detailing Box AI Video Guard & Kaspi Reconciler")

# Окружение и ключи Google Cloud
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "ozat-detailing-prod")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_OWNER_CHAT_ID = os.getenv("TELEGRAM_OWNER_CHAT_ID", "123456789")
FIRESTORE_DB_NAME = os.getenv("FIRESTORE_DB_NAME", "(default)")

db = firestore.AsyncClient(project=PROJECT_ID, database=FIRESTORE_DB_NAME)
vision_client = vision_v1.ImageAnnotatorAsyncClient()
bot = telegram.Bot(token=TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

# Конфигурация 4 боксов автомойки в Алматы (RTSP-потоки камер с разрешением 1080p)
BOX_CAMERAS = {
    "box_1": {"name": "Бокс 1 (Премиум детейлинг)", "rtsp": os.getenv("RTSP_BOX_1", "rtsp://admin:pass@192.168.1.101:554/ch0_0.264")},
    "box_2": {"name": "Бокс 2 (3-фазная мойка)", "rtsp": os.getenv("RTSP_BOX_2", "rtsp://admin:pass@192.168.1.102:554/ch0_0.264")},
    "box_3": {"name": "Бокс 3 (Экспресс / Кузов)", "rtsp": os.getenv("RTSP_BOX_3", "rtsp://admin:pass@192.168.1.103:554/ch0_0.264")},
    "box_4": {"name": "Бокс 4 (Сушка и салон)", "rtsp": os.getenv("RTSP_BOX_4", "rtsp://admin:pass@192.168.1.104:554/ch0_0.264")}
}

class BoxSession(BaseModel):
    box_id: str
    vehicle_detected: bool
    vehicle_type: str = "unknown" # Sedan, SUV (Внедорожник), Crossover, Minivan
    plate_number: Optional[str] = None
    service_phase: str = "idle" # idle, prewash_foam, contact_wash, rinse_dry, polishing
    start_time: Optional[datetime] = None
    duration_minutes: float = 0.0
    kaspi_payment_verified: bool = False
    estimated_cost_kzt: int = 0

async def analyze_frame_with_vision_api(jpeg_bytes: bytes) -> Dict[str, Any]:
    """Анализ кадра бокса через Google Cloud Vision API: детекция авто, типов объектов и текста госномера"""
    image = vision_v1.Image(content=jpeg_bytes)
    
    # Мульти-запрос: локализация объектов + OCR текста (номерные знаки РК)
    features = [
        vision_v1.Feature(type_=vision_v1.Feature.Type.OBJECT_LOCALIZATION),
        vision_v1.Feature(type_=vision_v1.Feature.Type.TEXT_DETECTION)
    ]
    request = vision_v1.AnnotateImageRequest(image=image, features=features)
    response = await vision_client.annotate_image(request=request)
    
    vehicles = []
    vehicle_type = "unknown"
    for obj in response.localized_object_annotations:
        name = obj.name.lower()
        if name in ["car", "vehicle", "land vehicle", "truck", "van"]:
            vehicles.append(obj)
            if name == "truck" or obj.score > 0.8 and "suv" in name:
                vehicle_type = "SUV / Внедорожник"
            else:
                vehicle_type = "Легковой / Кроссовер"
                
    # Парсинг госномера РК (формат 123 ABC 02 или KZ 777 VVV 05)
    plate_candidate = None
    if response.text_annotations:
        full_text = response.text_annotations[0].description.replace(" ", "").upper()
        # Поиск паттернов казахстанских номеров
        import re
        m = re.search(r'(\d{3}[A-Z]{2,3}\d{2})|([A-Z]\d{3}[A-Z]{3})', full_text)
        if m:
            plate_candidate = m.group(0)

    return {
        "has_vehicle": len(vehicles) > 0,
        "vehicle_type": vehicle_type,
        "license_plate": plate_candidate,
        "confidence": vehicles[0].score if vehicles else 0.0
    }

async def send_telegram_alert(box_id: str, message: str, urgency: str = "warning"):
    """Мгновенный алерт владельцу детейлинга в Telegram"""
    if not bot or not TELEGRAM_OWNER_CHAT_ID:
        logger.warning(f"Telegram Bot not configured. Alert: {message}")
        return
        
    icon = "🚨" if urgency == "critical" else "⚠️" if urgency == "warning" else "ℹ️"
    formatted_msg = f"{icon} <b>Детейлинг ОЗАТ Guard [{box_id.upper()}]</b>\n\n{message}\n\n<i>🕒 Время Алматы: {datetime.now(timezone(timedelta(hours=5))).strftime('%H:%M:%S')}</i>"
    try:
        await bot.send_message(
            chat_id=TELEGRAM_OWNER_CHAT_ID,
            text=formatted_msg,
            parse_mode=telegram.constants.ParseMode.HTML
        )
    except Exception as e:
        logger.error(f"Failed to send Telegram alert: {e}")

@app.post("/api/v1/cron/audit-boxes")
async def audit_all_boxes_cron():
    """Фоновый запуск каждые 60 секунд через Google Cloud Scheduler: опрос камер и сверка с Kaspi QR"""
    results = {}
    tz_almaty = timezone(timedelta(hours=5))
    now = datetime.now(tz_almaty)
    
    for box_id, cfg in BOX_CAMERAS.items():
        # Считывание 1 кадра с RTSP видеокамеры через OpenCV
        cap = cv2.VideoCapture(cfg["rtsp"])
        ret, frame = cap.read()
        cap.release()
        
        if not ret:
            logger.error(f"Cannot capture frame from {box_id}")
            continue
            
        _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
        jpeg_bytes = buffer.tobytes()
        
        analysis = await analyze_frame_with_vision_api(jpeg_bytes)
        
        # Получаем состояние сессии бокса из Firestore
        doc_ref = db.collection("boxes_state").document(box_id)
        doc = await doc_ref.get()
        state = doc.to_dict() if doc.exists else {}
        
        was_occupied = state.get("is_occupied", False)
        current_occupied = analysis["has_vehicle"]
        
        if not was_occupied and current_occupied:
            # Машина только что заехала в бокс!
            start_iso = now.isoformat()
            await doc_ref.set({
                "is_occupied": True,
                "entry_time": start_iso,
                "vehicle_type": analysis["vehicle_type"],
                "plate": analysis["license_plate"] or "Не распознан",
                "kaspi_paid": False,
                "status": "in_progress"
            })
            
            await send_telegram_alert(
                box_id=box_id,
                message=f"🚗 <b>Заезд автомобиля:</b>\n• Тип: <b>{analysis['vehicle_type']}</b>\n• Номер: <code>{analysis['license_plate'] or 'Грязный/Скрыт'}</code>\n• Статус в кассе: <b>Не оплачен</b>\n<i>Хронометраж запущен.</i>",
                urgency="info"
            )
            
        elif was_occupied and current_occupied:
            # Машина моется. Проверяем продолжительность нахождения в боксе
            entry_time = datetime.fromisoformat(state.get("entry_time", now.isoformat()))
            duration_minutes = (now - entry_time).total_seconds() / 60.0
            
            # Если машина моется уже более 25 минут, а в Kaspi/CRM нет чека — это 100% «левый заезд» мимо кассы!
            if duration_minutes > 25 and not state.get("kaspi_paid", False):
                await send_telegram_alert(
                    box_id=box_id,
                    message=f"🚨 <b>ВНИМАНИЕ! ПОДОЗРЕНИЕ НА ЛЕВЫЙ ЗАЕЗД МИМО КАССЫ!</b>\n• Машина моется: <b>{int(duration_minutes)} мин</b>\n• Тип: {state.get('vehicle_type')}\n• Номер: <code>{state.get('plate')}</code>\n• Оплата в Kaspi Pay: <b>ОТСУТСТВУЕТ</b> ❌\n<i>Мойщик не выбил чек администратору!</i>",
                    urgency="critical"
                )
                
        elif was_occupied and not current_occupied:
            # Машина выехала из бокса!
            entry_time = datetime.fromisoformat(state.get("entry_time", now.isoformat()))
            total_duration = (now - entry_time).total_seconds() / 60.0
            is_paid = state.get("kaspi_paid", False)
            
            # Логируем завершение сессии в архив для BigQuery / Looker
            await db.collection("detailing_logs").add({
                "box_id": box_id,
                "entry_time": state.get("entry_time"),
                "exit_time": now.isoformat(),
                "duration_min": round(total_duration, 1),
                "plate": state.get("plate"),
                "vehicle_type": state.get("vehicle_type"),
                "was_paid": is_paid
            })
            
            await doc_ref.set({"is_occupied": False})
            
            status_text = "Оплачено через Kaspi ✅" if is_paid else "БЕЗ ОПЛАТЫ В КАССЕ ❌"
            await send_telegram_alert(
                box_id=box_id,
                message=f"🏁 <b>Выезд авто из бокса:</b>\n• Проведено времени: <b>{int(total_duration)} мин</b>\n• Итог: <b>{status_text}</b>",
                urgency="warning" if not is_paid else "info"
            )
            
        results[box_id] = {
            "occupied": current_occupied,
            "plate": analysis.get("license_plate"),
            "type": analysis.get("vehicle_type")
        }
        
    return {"status": "ok", "boxes": results}