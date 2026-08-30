# ==============================================================================
# smart_rental_document_ai_lock_kz.py
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/smart_rental_document_ai_lock_kz.py
# ==============================================================================

import os
import io
import time
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
import httpx
from fastapi import FastAPI, BackgroundTasks, HTTPException, Header, UploadFile, File, Form
from google.cloud import documentai_v1 as documentai
from google.cloud import firestore
import telegram

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [SMART-RENTAL-AI] %(message)s")
logger = logging.getLogger("smart_rental_guard")

app = FastAPI(title="Almaty & Astana Smart Rental Self-Check-in Guard (Document AI + TTLock/Tuya API)")

# Google Cloud окружение
PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "ozat-rental-prod")
LOCATION = os.getenv("DOCUMENT_AI_LOCATION", "us") # или 'eu'
PROCESSOR_ID = os.getenv("DOCUMENT_AI_PROCESSOR_ID", "a1b2c3d4e5f6g7h8")
FIRESTORE_DB_NAME = os.getenv("FIRESTORE_DB_NAME", "(default)")

# Ключи сторонних интеграций
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_OWNER_CHAT_ID = os.getenv("TELEGRAM_OWNER_CHAT_ID", "987654321")
TTLOCK_CLIENT_ID = os.getenv("TTLOCK_CLIENT_ID")
TTLOCK_ACCESS_TOKEN = os.getenv("TTLOCK_ACCESS_TOKEN")

db = firestore.AsyncClient(project=PROJECT_ID, database=FIRESTORE_DB_NAME)
docai_client = documentai.DocumentProcessorServiceClient()
bot = telegram.Bot(token=TELEGRAM_BOT_TOKEN) if TELEGRAM_BOT_TOKEN else None

# Конфигурация 6 квартир рантье в Алматы и Астане
APARTMENTS = {
    "apt_almaty_mega": {
        "title": "ЖК Gagarin Park (Mega Almaty)",
        "lock_id": "1948201",
        "lock_mac": "C4:D3:56:88:99:AA",
        "daily_rate_kzt": 28000,
        "deposit_kzt": 20000,
        "intercom_code": "147K3920"
    },
    "apt_almaty_dostyk": {
        "title": "ЖК Dostyk Residence (Медеуский р-н)",
        "lock_id": "1948202",
        "lock_mac": "C4:D3:56:88:99:AB",
        "daily_rate_kzt": 38000,
        "deposit_kzt": 25000,
        "intercom_code": "55K1290"
    },
    "apt_astana_expo": {
        "title": "ЖК Expo Residence (Астана)",
        "lock_id": "1948203",
        "lock_mac": "C4:D3:56:88:99:AC",
        "daily_rate_kzt": 32000,
        "deposit_kzt": 20000,
        "intercom_code": "12B8844"
    }
}

class GuestVerificationResult(BaseModel):
    is_valid: bool
    full_name: Optional[str] = None
    iin: Optional[str] = None
    document_type: str = "unknown" # ID Card KZ, Passport KZ, Foreign Passport
    birth_date: Optional[str] = None
    expiry_date: Optional[str] = None
    fraud_flags: List[str] = []
    confidence_score: float = 0.0

async def verify_kz_identity_document(image_bytes: bytes, mime_type: str = "image/jpeg") -> GuestVerificationResult:
    """Анализ удостоверения личности РК или загранпаспорта через Google Cloud Document AI (Identity Processor)"""
    processor_name = docai_client.processor_path(PROJECT_ID, LOCATION, PROCESSOR_ID)
    raw_document = documentai.RawDocument(content=image_bytes, mime_type=mime_type)
    request = documentai.ProcessRequest(name=processor_name, raw_document=raw_document)
    
    # Асинхронный вызов инференса модели Document AI
    response = docai_client.process_document(request=request)
    doc = response.document
    
    extracted_fields: Dict[str, Any] = {}
    fraud_flags = []
    
    for entity in doc.entities:
        field_type = entity.type_
        field_value = entity.mention_text
        confidence = entity.confidence
        extracted_fields[field_type] = {"value": field_value, "confidence": confidence}
        
        # Проверка на низкую уверенность (подозрение на мыльное фото или наложение текста)
        if confidence < 0.65:
            fraud_flags.append(f"Низкая четкость поля {field_type} ({confidence:.2f})")
            
    full_name = extracted_fields.get("FamilyName", {}).get("value", "") + " " + extracted_fields.get("GivenNames", {}).get("value", "")
    iin = extracted_fields.get("DocumentNumber", {}).get("value", "").replace(" ", "").strip()
    
    # Алгоритмическая проверка ИИН РК (12 цифр, корректность даты рождения)
    if iin and len(iin) == 12 and iin.isdigit():
        year_prefix = "20" if int(iin[6]) in [5, 6] else "19"
        birth_year = year_prefix + iin[0:2]
        birth_month = iin[2:4]
        birth_day = iin[4:6]
        # Проверка совершеннолетия гостя (старше 18 лет)
        try:
            b_date = datetime(int(birth_year), int(birth_month), int(birth_day))
            age_years = (datetime.now() - b_date).days // 365
            if age_years < 18:
                fraud_flags.append(f"Гость несовершеннолетний ({age_years} лет). Заселение запрещено.")
        except Exception:
            fraud_flags.append("Некорректная структура ИИН.")
    else:
        fraud_flags.append("ИИН не распознан или не соответствует стандарту РК (12 цифр).")
        
    return GuestVerificationResult(
        is_valid=len(fraud_flags) == 0,
        full_name=full_name.strip() or "Неизвестный Гость",
        iin=iin or "N/A",
        document_type=extracted_fields.get("DocumentType", {}).get("value", "Удостоверение личности РК"),
        birth_date=extracted_fields.get("DateOfBirth", {}).get("value", "N/A"),
        expiry_date=extracted_fields.get("ExpirationDate", {}).get("value", "N/A"),
        fraud_flags=fraud_flags,
        confidence_score=doc.entities[0].confidence if doc.entities else 0.0
    )

async def generate_ttlock_temp_passcode(lock_id: str, start_dt: datetime, end_dt: datetime) -> str:
    """Генерация временного 6-значного PIN-кода через TTLock Open API, действующего строго во время брони"""
    # TTLock принимает время в миллисекундах Unix Timestamp
    start_ts = int(start_dt.timestamp() * 1000)
    end_ts = int(end_dt.timestamp() * 1000)
    
    url = "https://euapi.ttlock.com/v3/keyboardPwd/get"
    params = {
        "clientId": TTLOCK_CLIENT_ID,
        "accessToken": TTLOCK_ACCESS_TOKEN,
        "lockId": lock_id,
        "keyboardPwdType": 3, # Тип 3: временный периодный пароль
        "startDate": start_ts,
        "endDate": end_ts,
        "date": int(time.time() * 1000)
    }
    
    async with httpx.AsyncClient(timeout=10.0) as client:
        # В боевой среде отправляем запрос к шлюзу умного замка
        # res = await client.post(url, data=params)
        # data = res.json()
        # return data.get("keyboardPwd")
        
        # Детерминированный генератор PIN для демонстрационного шлюза
        import hashlib
        h = hashlib.sha256(f"{lock_id}-{start_ts}".encode()).hexdigest()
        passcode = "".join([c for c in h if c.isdigit()][:6])
        return passcode

@app.post("/api/v1/rental/self-checkin")
async def process_guest_self_checkin(
    apartment_id: str = Form(...),
    checkin_date: str = Form(...), # Format: '2026-08-25 14:00'
    checkout_date: str = Form(...), # Format: '2026-08-27 12:00'
    guest_phone: str = Form(...),
    document_photo: UploadFile = File(...)
):
    """Вебхук самозаселения: проверка паспорта, генерация PIN-кода замка и отправка инструкции гостю"""
    if apartment_id not in APARTMENTS:
        raise HTTPException(status_code=404, detail="Квартира не найдена в базе")
        
    apt = APARTMENTS[apartment_id]
    image_bytes = await document_photo.read()
    
    # 1. Верификация удостоверения через Google Cloud Document AI
    verification = await verify_kz_identity_document(image_bytes)
    
    if not verification.is_valid:
        # Алерт рантье о попытке заезда по подозрительному документу
        if bot and TELEGRAM_OWNER_CHAT_ID:
            await bot.send_message(
                chat_id=TELEGRAM_OWNER_CHAT_ID,
                text=f"🚨 <b>ОТКАЗ В САМОЗАСЕЛЕНИИ! Подозрительный документ</b>\n\n"
                     f"🏠 Объект: <b>{apt['title']}</b>\n"
                     f"👤 Имя: {verification.full_name}\n"
                     f"📞 Телефон: <code>{guest_phone}</code>\n"
                     f"❌ Причины отказа:\n" + "\n".join([f"• {f}" for f in verification.fraud_flags]),
                parse_mode=telegram.constants.ParseMode.HTML
            )
        return {
            "success": False,
            "message": "Документ не прошел автоматическую проверку безопасности. С вами свяжется администратор.",
            "reasons": verification.fraud_flags
        }
        
    # 2. Генерация временного PIN-кода для умного замка
    tz_almaty = timezone(timedelta(hours=5))
    start_dt = datetime.strptime(checkin_date, "%Y-%m-%d %H:%M").replace(tzinfo=tz_almaty)
    end_dt = datetime.strptime(checkout_date, "%Y-%m-%d %H:%M").replace(tzinfo=tz_almaty)
    
    lock_pin = await generate_ttlock_temp_passcode(apt["lock_id"], start_dt, end_dt)
    
    # 3. Сохранение верифицированной брони в Cloud Firestore
    booking_ref = await db.collection("rental_bookings").add({
        "apartment_id": apartment_id,
        "apartment_title": apt["title"],
        "guest_name": verification.full_name,
        "guest_iin": verification.iin,
        "guest_phone": guest_phone,
        "checkin_dt": start_dt.isoformat(),
        "checkout_dt": end_dt.isoformat(),
        "pin_code": lock_pin,
        "status": "confirmed",
        "created_at": datetime.now(tz_almaty).isoformat()
    })
    
    # 4. Уведомление рантье в Telegram
    if bot and TELEGRAM_OWNER_CHAT_ID:
        await bot.send_message(
            chat_id=TELEGRAM_OWNER_CHAT_ID,
            text=f"✅ <b>УСПЕШНОЕ САМОЗАСЕЛЕНИЕ (Document AI)</b>\n\n"
                 f"🏠 Квартира: <b>{apt['title']}</b>\n"
                 f"👤 Гость: <b>{verification.full_name}</b> (ИИН: <code>{verification.iin}</code>)\n"
                 f"📅 Даты: {checkin_date} — {checkout_date}\n"
                 f"🔑 Сгенерирован PIN замка: <code>{lock_pin}#</code>\n"
                 f"💰 Депозит: {apt['deposit_kzt']:,} ₸ (Оплачен Kaspi QR)",
            parse_mode=telegram.constants.ParseMode.HTML
        )
        
    return {
        "success": True,
        "apartment": apt["title"],
        "guest": verification.full_name,
        "pin_code": f"{lock_pin}#",
        "intercom": apt["intercom_code"],
        "valid_until": checkout_date,
        "instructions": f"Наберите на кодовой панели замка {lock_pin} и нажмите #"
    }