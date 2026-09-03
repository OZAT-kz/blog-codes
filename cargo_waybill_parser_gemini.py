# ==============================================================================
# Document AI + Gemini 2.5 Flash Pipeline
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cargo_waybill_parser_gemini.py
# ==============================================================================

import os
import json
import logging
from typing import Dict, Any, Optional
from google.api_core.client_options import ClientOptions
from google.cloud import documentai
from google import genai
from google.genai import types

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Настройки Document AI (OCR)
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT")
LOCATION = os.environ.get("DOCAI_LOCATION", "eu")
PROCESSOR_ID = os.environ.get("DOCAI_PROCESSOR_ID")

# Инициализация клиентов
docai_client = documentai.DocumentProcessorServiceClient(
    client_options=ClientOptions(api_endpoint=f"{LOCATION}-documentai.googleapis.com")
)
ai_client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

SYSTEM_PROMPT = """Ты — экспертный логистический ассистент карго-компании (Казахстан-Китай).
На вход поступает сырой распознанный текст (OCR) с китайской накладной (快递单) от курьеров ZTO, YTO, SF Express, STO или скриншот из 1688/Taobao/WeChat.
Твоя задача — извлечь следующие данные, игнорируя визуальный мусор и нерелевантный текст:
1. Идентификатор/Код клиента (часто содержит латиницу и цифры, например "ALM-882", "KZ-01-M", "K89").
2. Трек-номер посылки (快递单号 / 运单号) — обычно длинный цифровой или буквенно-цифровой код (12-15 символов).
3. Курьерская служба (ZTO/中通, YTO/圆通, SF/顺丰 и т.д.).
4. Вес в кг (重量), если указан.
5. Описание товара (переведи с китайского на русский).

Верни строгий JSON:
{
  "client_code": "string или null",
  "tracking_number": "string",
  "courier": "string",
  "weight_kg": number или null,
  "description_ru": "string"
}"""

async def process_cargo_waybill(image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """
    Двухэтапный парсинг:
    1. Document AI для высокоточного OCR мелкого/мятого китайского текста.
    2. Gemini 2.5 Flash для семантического извлечения сущностей из текста OCR.
    """
    
    # ЭТАП 1: OCR через Document AI (Pretrained OCR Processor)
    name = docai_client.processor_path(PROJECT_ID, LOCATION, PROCESSOR_ID)
    raw_document = documentai.RawDocument(content=image_bytes, mime_type=mime_type)
    request = documentai.ProcessRequest(name=name, raw_document=raw_document)
    
    logger.info("Отправка в Document AI...")
    result = docai_client.process_document(request=request)
    document = result.document
    raw_text = document.text
    logger.info(f"Document AI извлек {len(raw_text)} символов текста.")

    # Если OCR не нашел текст, пробуем отдать картинку напрямую в Gemini (Fallback)
    if len(raw_text.strip()) < 10:
        logger.warning("Document AI не нашел текст. Используем Gemini Multimodal Fallback.")
        prompt_content = [
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
            "Проанализируй накладную и верни JSON."
        ]
    else:
        # ЭТАП 2: Gemini 2.5 Flash для структурирования
        logger.info("Передача сырого текста в Gemini 2.5 Flash...")
        prompt_content = [
            f"Вот сырой текст с накладной, полученный через OCR:\n\n{raw_text}\n\n",
            "Извлеки из него данные и верни JSON согласно системной инструкции."
        ]

    response = ai_client.models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt_content,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.0
        )
    )
    
    try:
        parsed_data = json.loads(response.text)
        return parsed_data
    except json.JSONDecodeError:
        logger.error("Ошибка парсинга JSON от Gemini.")
        return {"error": "Failed to parse"}
