# ==============================================================================
# WhatsApp Voice-to-CRM Webhook on Gemini 2.5 Flash
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/whatsapp_audio_to_1c_gemini.py
# ==============================================================================

import os
import json
import httpx
from fastapi import FastAPI, Request, BackgroundTasks
from google import genai
from google.genai import types

app = FastAPI(title="WhatsApp Voice-to-CRM Webhook")

# Lazy init
ai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
WHATSAPP_TOKEN = os.environ.get("WHATSAPP_ACCESS_TOKEN")

SYSTEM_PROMPT = """Ты — интеллектуальный B2B менеджер по продажам.
Твоя задача: прослушать голосовое сообщение клиента, распознать все запрашиваемые товары (номенклатуру), их количество, адрес доставки и комментарии.
Клиент может говорить с ошибками, сленгом (например, "ротбанд", "саморезы семечки"), перебивать сам себя ("ой нет, давай 4 мешка, а не 3").
Извлеки ФИНАЛЬНЫЙ список товаров.
Верни строгий JSON:
{
  "customer_name": "string (если представился, иначе null)",
  "delivery_address": "string",
  "items": [{"name": "string", "quantity": number, "unit": "шт/кг/мешок"}],
  "urgency": "high|normal",
  "comments": "string"
}"""

async def process_voice_and_create_order(audio_url: str, sender_phone: str):
    async with httpx.AsyncClient() as client:
        # 1. Скачиваем OGG аудио из WhatsApp
        audio_resp = await client.get(
            audio_url,
            headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
        )
        audio_bytes = audio_resp.content

        # 2. Передаем аудио напрямую в Gemini 2.5 Flash (Без промежуточного Whisper STT!)
        # Gemini 2.5 Flash нативно понимает аудио-поток.
        response = ai_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=audio_bytes, mime_type="audio/ogg"),
                "Проанализируй голосовой заказ и верни JSON."
            ],
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.0
            )
        )
        
        parsed_order = json.loads(response.text)
        
        # 3. Отправляем в 1С / МойСклад (вызов внешнего микросервиса/функции)
        from crm_service import push_to_moysklad
        order_id = await push_to_moysklad(sender_phone, parsed_order)
        
        # 4. Отвечаем клиенту текстом в WhatsApp
        reply_msg = f"✅ Принято! Оформил заказ #{order_id}. Позиций: {len(parsed_order['items'])}. Доставка: {parsed_order['delivery_address']}."
        await client.post(
            "https://graph.facebook.com/v17.0/PHONE_NUMBER_ID/messages",
            headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"},
            json={"messaging_product": "whatsapp", "to": sender_phone, "text": {"body": reply_msg}}
        )

@app.post("/webhook/whatsapp")
async def whatsapp_webhook(request: Request, bg_tasks: BackgroundTasks):
    data = await request.json()
    # Базовый парсинг Meta Graph API
    for entry in data.get("entry", []):
        for change in entry.get("changes", []):
            msg = change.get("value", {}).get("messages", [{}])[0]
            
            if msg.get("type") == "audio":
                audio_id = msg["audio"]["id"]
                sender = msg["from"]
                
                # Запрос URL аудио
                async with httpx.AsyncClient() as client:
                    media_res = await client.get(
                        f"https://graph.facebook.com/v17.0/{audio_id}",
                        headers={"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
                    )
                    audio_url = media_res.json()["url"]
                
                # Асинхронно обрабатываем, чтобы Webhook не упал по таймауту
                bg_tasks.add_task(process_voice_and_create_order, audio_url, sender)
                
    return {"status": "ok"}
