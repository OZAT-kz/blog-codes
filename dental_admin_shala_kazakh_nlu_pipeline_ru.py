# ==============================================================================
# FastAPI & Gemini 2.5 Flash Dental Shala-Kazakh NLU Pipeline (RU)
# Source: OZAT Engineering Blog (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dental_admin_shala_kazakh_nlu_pipeline_ru.py
# ==============================================================================

import os
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, date, time
from pydantic import BaseModel, Field
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
import httpx
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [DENTAL-AI] %(message)s")
logger = logging.getLogger("dental_admin")

app = FastAPI(title="Dental Clinic Shala-Kazakh AI Admin")

# Инициализация Google GenAI SDK (Gemini 2.5 Flash для ультранизкой задержки < 800ms)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
CRM_API_BASE_URL = os.getenv("CRM_API_BASE_URL", "https://crm.almaty-dental.kz/api/v1")
CRM_API_KEY = os.getenv("CRM_API_KEY", "secret-clinic-token")
WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")

ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

class DentalIntentExtraction(BaseModel):
    intent: str = Field(
        description="Категория намерения: 'CONFIRM' (подтверждение), 'RESCHEDULE' (перенос времени), 'CANCEL' (отмена), 'PRICE_INQUIRY' (вопрос цены), 'ACUTE_PAIN' (острая боль/urgency), 'OTHER'"
    )
    confidence: float = Field(description="Уверенность распознавания от 0.0 до 1.0")
    detected_language: str = Field(description="'ru', 'kz', 'shala_kazakh' или 'translit'")
    target_date: Optional[str] = Field(None, description="Желаемая дата визита в формате YYYY-MM-DD, если указана")
    target_time_preference: Optional[str] = Field(None, description="Желаемое время: 'morning', 'lunch', 'evening', '15:00', '18:30' и т.д.")
    pain_level: Optional[str] = Field(None, description="'mild', 'acute', 'swelling' (флюс/отек), 'bleeding'")
    reason_ru: Optional[str] = Field(None, description="Краткое резюме причины обращения на чистом русском для врача")
    reply_text_kazakh_or_mixed: str = Field(
        description="Живой, уважительный и заботливый ответ пациенту на том же языковом миксе/диалекте (шала-қазақша/қазақша/орысша)"
    )

SYSTEM_PROMPT = """
Ты — старший администратор престижной алматинской стоматологии «Дентал Про».
Твоя суперсила: ты свободно и органично понимаешь шала-казахский язык (суржик, сленг, смешение казакша и орысша, латинский транслит, опечатки в спешке).

ПРИМЕРЫ ВХОДЯЩИХ СООБЩЕНИЙ И СМЫСЛОВ:
1. «Салем админ, ертенге записьти 3-ке перенести етип беринизши, жумыстан босамай жатырмын»
   -> Intent: RESCHEDULE, target_time_preference: "15:00", language: "shala_kazakh"
2. «Тисим зулдеп ауырып жатыр, тунимен уйыктамадым, бугинге тез арада терезе бар ма?»
   -> Intent: ACUTE_PAIN, pain_level: "acute", language: "kz"
3. «Уалейкумсалам, ия барам ертен сагат 11-де, рахмет»
   -> Intent: CONFIRM, language: "shala_kazakh"
4. «Казир келе жатырмын, пробка на Аль-Фараби, 15 минут кешигемин»
   -> Intent: CONFIRM (с пометкой опоздания 15 мин), language: "shala_kazakh"

ПРАВИЛА ОТВЕТА:
- Отвечай вежливо, коротко (1-3 предложения), тепло, с заботой о пациенте.
- Используй естественный тон алматинцев: «Жарайды, түсінікті!», «Қайырлы күн!», «Алаңдамаңыз, дәрігер күтеді».
- Если пациент пишет на суржике/шала-казахском — отвечай на чистом и понятном казахском или легком дружелюбном миксе без занудства.
- Если у пациента острая боль (ACUTE_PAIN) — сразу предложи ближайшее экстренное окно и напомни не греть щеку.
"""

async def parse_patient_message_with_gemini(message_text: str, patient_context: Dict[str, Any]) -> DentalIntentExtraction:
    """Анализ сообщения через Structured Outputs Gemini 2.5 Flash."""
    context_str = json.dumps(patient_context, ensure_ascii=False)
    user_prompt = f"Контекст текущей записи пациента: {context_str}\nВходящее сообщение пациента: \"{message_text}\""
    
    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            temperature=0.2,
            response_mime_type="application/json",
            response_schema=DentalIntentExtraction
        )
    )
    
    return DentalIntentExtraction.model_validate_json(response.text)

async def check_crm_available_slots(doctor_id: str, target_date: str) -> List[str]:
    """Запрос свободных окон в Dental CRM / 1C:Медицина."""
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                f"{CRM_API_BASE_URL}/schedule/slots",
                params={"doctor_id": doctor_id, "date": target_date},
                headers={"Authorization": f"Bearer {CRM_API_KEY}"},
                timeout=3.0
            )
            if resp.status_code == 200:
                return resp.json().get("available_slots", [])
        except Exception as e:
            logger.error(f"CRM Slots API Error: {e}")
    return ["11:00", "15:30", "18:00"] # Fallback

async def update_crm_booking_status(booking_id: str, action: str, new_slot: Optional[str] = None):
    """Обновление статуса брони в CRM в реальном времени."""
    payload = {"booking_id": booking_id, "status": action, "rescheduled_slot": new_slot}
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{CRM_API_BASE_URL}/bookings/update",
                json=payload,
                headers={"Authorization": f"Bearer {CRM_API_KEY}"},
                timeout=3.0
            )
            logger.info(f"✅ CRM updated: Booking {booking_id} -> {action} ({new_slot})")
        except Exception as e:
            logger.error(f"❌ Failed to update CRM: {e}")

async def send_whatsapp_reply(phone_number: str, text: str):
    """Отправка ответа в WhatsApp через Meta Cloud API."""
    if not WHATSAPP_TOKEN or not WHATSAPP_PHONE_NUMBER_ID:
        logger.info(f"[SIMULATED WHATSAPP OUT] To: {phone_number} | Text: {text}")
        return

    url = f"https://graph.facebook.com/v19.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}", "Content-Type": "application/json"}
    body = {
        "messaging_product": "whatsapp",
        "to": phone_number,
        "type": "text",
        "text": {"body": text}
    }
    async with httpx.AsyncClient() as client:
        await client.post(url, headers=headers, json=body, timeout=5.0)

@app.post("/webhook/whatsapp")
async def handle_whatsapp_webhook(request: Request, background_tasks: BackgroundTasks):
    """Прием входящих сообщений WhatsApp и запуск пайплайна."""
    data = await request.json()
    try:
        entry = data.get("entry", [])[0]
        changes = entry.get("changes", [])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])
        
        if not messages:
            return {"status": "no_messages"}
            
        msg = messages[0]
        from_phone = msg.get("from")
        text_body = msg.get("text", {}).get("body", "")
        
        if not text_body:
            return {"status": "non_text_ignored"}

        # Моделируем извлечение контекста записи из базы
        patient_context = {
            "phone": from_phone,
            "patient_name": "Берик Мырза",
            "active_booking": {
                "id": "BK-9481",
                "doctor_name": "Д-р Касымов А. Е. (Ортопед)",
                "scheduled_datetime": "2026-08-21 14:30:00",
                "chair_number": 2
            }
        }
        
        # Запуск асинхронной обработки в фоне (не блокирует 200 OK вебхука)
        background_tasks.add_task(process_pipeline, from_phone, text_body, patient_context)
        return {"status": "accepted"}
        
    except Exception as err:
        logger.error(f"Webhook processing error: {err}")
        return {"status": "error", "message": str(err)}

async def process_pipeline(phone: str, text: str, ctx: Dict[str, Any]):
    start_time = datetime.now()
    analysis = await parse_patient_message_with_gemini(text, ctx)
    duration_ms = (datetime.now() - start_time).total_seconds() * 1000
    logger.info(f"⚡ Gemini NLU completed in {duration_ms:.1f}ms: Intent={analysis.intent}, Lang={analysis.detected_language}")
    
    booking = ctx.get("active_booking", {})
    booking_id = booking.get("id")
    
    if analysis.intent == "CONFIRM":
        await update_crm_booking_status(booking_id, "CONFIRMED")
        await send_whatsapp_reply(phone, analysis.reply_text_kazakh_or_mixed)
        
    elif analysis.intent == "RESCHEDULE":
        target_d = analysis.target_date or date.today().strftime("%Y-%m-%d")
        slots = await check_crm_available_slots("DOC-12", target_d)
        slots_str = ", ".join(slots[:3])
        reply = f"{analysis.reply_text_kazakh_or_mixed}\n\n🗓 {target_d} күніне бос уақыттар: *{slots_str}*. Қайсысы сізге ыңғайлы?"
        await update_crm_booking_status(booking_id, "RESCHEDULE_PENDING")
        await send_whatsapp_reply(phone, reply)
        
    elif analysis.intent == "ACUTE_PAIN":
        await update_crm_booking_status(booking_id, "URGENT_TRIAGE")
        reply = f"{analysis.reply_text_kazakh_or_mixed}\n\n🚨 Біз сізді сағат 12:15-тегі жедел терезеге (экстренное окно) қостық. Клиникаға келе беріңіз!"
        await send_whatsapp_reply(phone, reply)
    else:
        await send_whatsapp_reply(phone, analysis.reply_text_kazakh_or_mixed)
