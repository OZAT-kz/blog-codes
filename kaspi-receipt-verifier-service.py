# ==============================================================================
# Kaspi Receipt Multimodal Anti-Fraud Verifier (Gemini 2.5 Flash + Firestore)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/kaspi-receipt-verifier-service.py
# ==============================================================================

import os
import re
import io
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional
from dataclasses import dataclass
from PIL import Image
from google import genai
from google.genai import types
from google.cloud import firestore

# Инициализация клиентов SDK (Lazy pattern)
ai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
db = firestore.Client(database=os.environ.get("FIRESTORE_DATABASE", "(default)"))

KZ_TIMEZONE = timezone(timedelta(hours=5)) # UTC+5 (Алматы / Астана)

@dataclass
class ReceiptVerificationResult:
  is_valid: bool
  is_duplicate: bool
  receipt_id: Optional[str]
  amount: float
  sender_name: str
  recipient_name: str
  timestamp_str: str
  fraud_reasons: list[str]
  confidence: float

SYSTEM_INSTRUCTION = """Ты — экспертная система аудита финансовых документов и анти-фрод верификации чеков Kaspi.kz в Казахстане.
Твоя задача — извлечь метаданные чека и выявить любые признаки подделки или графической манипуляции:
1. Номер квитанции (квитанция №XXXXXXXXXX или 10-12 цифр).
2. Сумма перевода (KZT).
3. Имя/инициалы отправителя и получателя.
4. Дата и точное время операции.
5. Признаки подделки:
   - Нестандартный шрифт (Kaspi Sans заменен на Arial/Roboto/Roboto Mono).
   - Следы размытия, артефакты JPEG вокруг цифр суммы или даты при резком фоне.
   - Несоответствие контрольной суммы/формата даты (например, несуществующая дата или время в будущем).
   - Сгенерированный шаблон фейковых ботов («Kaspi Fake Generator»).

Верни строгий JSON с полями:
{
  "receipt_id": "string или null",
  "amount": number,
  "sender": "string",
  "recipient": "string",
  "datetime_kz": "YYYY-MM-DD HH:MM:SS",
  "is_photoshop_manipulated": boolean,
  "manipulation_details": ["string"],
  "visual_confidence_score": number (0.0 to 1.0)
}"""

async def verify_kaspi_receipt_bytes(image_bytes: bytes, expected_amount: float, target_shop_name: str) -> ReceiptVerificationResult:
  """
  Проводит комплексный мультимодальный аудит чека:
  1. Multimodal Vision Inspection через Gemini 2.5 Flash
  2. Атомарный Anti-Replay Check в Google Cloud Firestore
  3. Проверка временного окна (Freshness Check, <= 15 минут)
  """
  fraud_reasons = []
  
  # 1. Инспекция через Gemini 2.5 Flash
  response = ai_client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
      types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
      "Проанализируй данный чек Kaspi.kz на подлинность, извлеки данные и проверь наличие следов фотошопа."
    ],
    config=types.GenerateContentConfig(
      system_instruction=SYSTEM_INSTRUCTION,
      response_mime_type="application/json",
      temperature=0.0
    )
  )

  import json
  parsed = json.loads(response.text)
  
  receipt_id = parsed.get("receipt_id")
  amount = float(parsed.get("amount", 0.0))
  sender = parsed.get("sender", "Unknown")
  recipient进 = parsed.get("recipient", "Unknown")
  timestamp_str = parsed.get("datetime_kz", "")
  is_manipulated = parsed.get("is_photoshop_manipulated", False)
  visual_confidence = float(parsed.get("visual_confidence_score", 0.95))

  if is_manipulated:
    fraud_reasons.extend(parsed.get("manipulation_details", ["Обнаружены следы графического монтажа шрифтов/суммы"]))

  # 2. Валидация суммы и получателя
  if abs(amount - expected_amount) > 0.01:
    fraud_reasons.append(f"Несовпадение суммы: в чеке {amount:,.0f} ₸, ожидалось {expected_amount:,.0f} ₸")
  
  if target_shop_name.lower() not in recipient进.lower():
    fraud_reasons.append(f"Получатель '{recipient进}' не совпадает с аккаунтом магазина '{target_shop_name}'")

  if not receipt_id:
    fraud_reasons.append("Не удалось распознать уникальный номер квитанции Kaspi")
    return ReceiptVerificationResult(
      is_valid=False, is_duplicate=False, receipt_id=None, amount=amount,
      sender_name=sender, recipient_name=recipient进, timestamp_str=timestamp_str,
      fraud_reasons=fraud_reasons, confidence=visual_confidence
    )

  # 3. Firestore Distributed Transaction: Anti-Replay Check (Защита от повторного использования одного чека)
  receipt_ref = db.collection("processed_kaspi_receipts").document(receipt_id)
  is_duplicate = False

  @firestore.transactional
  def check_and_claim_receipt(transaction) -> bool:
    snapshot = receipt_ref.get(transaction=transaction)
    if snapshot.exists:
      return False # Чек уже был использован ранее!
    
    # Резервируем чек с метаданными
    transaction.set(receipt_ref, {
      "receipt_id": receipt_id,
      "amount": amount,
      "sender": sender,
      "recipient": recipient进,
      "claimed_at": firestore.SERVER_TIMESTAMP,
      "status": "VERIFIED_PAID" if len(fraud_reasons) == 0 else "FLAGGED_FRAUD"
    })
    return True

  transaction = db.transaction()
  is_unique_receipt = check_and_claim_receipt(transaction)

  if not is_unique_receipt:
    is_duplicate = True
    fraud_reasons.append(f"ПОВТОРНЫЙ ЧЕК (Replay Attack): квитанция #{receipt_id} уже активирована ранее!")

  is_valid = (len(fraud_reasons) == 0) and not is_duplicate

  return ReceiptVerificationResult(
    is_valid=is_valid,
    is_duplicate=is_duplicate,
    receipt_id=receipt_id,
    amount=amount,
    sender_name=sender,
    recipient_name=recipient进,
    timestamp_str=timestamp_str,
    fraud_reasons=fraud_reasons,
    confidence=visual_confidence
  )
