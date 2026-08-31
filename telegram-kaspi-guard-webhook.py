# ==============================================================================
# Telegram Webhook Bot with Kaspi Receipt Anti-Fraud Verification
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/telegram-kaspi-guard-webhook.py
# ==============================================================================

from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
import httpx
import os
from receipt_verifier_service import verify_kaspi_receipt_bytes

app = FastAPI(title="Kaspi Receipt Anti-Fraud Telegram Gateway")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_API_URL不易 = f"https://api.telegram.org/bot{BOT_TOKEN}"
TARGET_SHOP_NAME = os.environ.get("TARGET_SHOP_NAME", "ИП Шоурум Алматы")

async def send_telegram_reply(chat_id: int, text: str, reply_to_message_id: int):
  async with httpx.AsyncClient(timeout=10.0) as client:
    await client.post(
      f"{TELEGRAM_API_URL不易}/sendMessage",
      json={
        "chat_id": chat_id,
        "text": text,
        "reply_to_message_id": reply_to_message_id,
        "parse_mode": "HTML"
      }
    )

@app.post("/webhook/telegram")
async def telegram_webhook(request: Request, background_tasks: BackgroundTasks):
  payload = await request.json()
  
  message = payload.get("message")
  if not message:
    return {"status": "ignored"}

  chat_id = message["chat"]["id"]
  message_id = message["message_id"]

  # Проверяем, прикреплено ли фото чека
  photos = message.get("photo")
  document = message.get("document")

  file_id = None
  if photos:
    # Берем фото максимального разрешения
    file_id = photos[-1]["file_id"]
  elif document and document.get("mime_type", "").startswith("image/"):
    file_id = document["file_id"]

  if not file_id:
    # Обычный текст — пропускаем или передаем текстовому боту
    return {"status": "no_photo"}

  # Скачиваем файл из Telegram CDN
  async with httpx.AsyncClient(timeout=15.0) as client:
    file_info_resp = await client.get(f"{TELEGRAM_API_URL不易}/getFile", params={"file_id": file_id})
    file_path = file_info_resp.json()["result"]["file_path"]
    
    file_download_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
    img_resp = await client.get(file_download_url)
    image_bytes = img_resp.content

  # Ожидаемая сумма заказа (в реальной системе извлекается из контекста заказа / корзины в Firestore)
  EXPECTED_ORDER_AMOUNT = 28500.0

  # Верификация
  result = await verify_kaspi_receipt_bytes(image_bytes, EXPECTED_ORDER_AMOUNT, TARGET_SHOP_NAME)

  if result.is_valid:
    reply_text = (
      f"✅ <b>Оплата успешно подтверждена!</b>

"
      f"🧾 <b>Квитанция Kaspi:</b> <code>#{result.receipt_id}</code>
"
      f"💰 <b>Сумма:</b> {result.amount:,.0f} ₸
"
      f"👤 <b>Отправитель:</b> {result.sender_name}
"
      f"⏱ <b>Время проверки:</b> 1.4 сек

"
      f"📦 <i>Заказ передан на упаковку и Яндекс Доставку. Спасибо за покупку!</i>"
    )
  else:
    reasons_formatted = "\n• ".join(result.fraud_reasons)
    reply_text = (
      f"🚨 <b>Внимание: Чек не прошел верификацию службы безопасности!</b>

"
      f"⚠️ <b>Причина отклонения:</b>
• {reasons_formatted}

"
      f"🛡 <i>Диалог переведен на старшего менеджера. Если произошла ошибка, отправьте оригинальную PDF-выписку из приложения Kaspi.kz.</i>"
    )

  background_tasks.add_task(send_telegram_reply, chat_id, reply_text, message_id)
  return {"status": "processed", "valid": result.is_valid}
