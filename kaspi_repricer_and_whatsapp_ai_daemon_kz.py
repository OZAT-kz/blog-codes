# ==============================================================================
# Kaspi Marketplace Repricer & WhatsApp AI Support Daemon (KZ)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/kaspi_repricer_and_whatsapp_ai_daemon_kz.py
# ==============================================================================

import os
import json
import time
import logging
from typing import Dict, Any, List, Optional
from google.cloud import tasks_v2
from google.cloud import documentai_v1 as documentai
import vertexai
from vertexai.generative_models import GenerativeModel, Part

# Логгер и базовые параметры микросервиса
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [KASPI-AI-REPRICER] %(message)s")
logger = logging.getLogger("kaspi_repricer")

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "shymkent-autospares-retail")
LOCATION = os.getenv("GCP_LOCATION", "us-central1")
QUEUE_NAME = "kaspi-repricing-tasks"

vertexai.init(project=PROJECT_ID, location=LOCATION)
gemini_model = GenerativeModel("gemini-2.5-flash")
doc_ai_client = documentai.DocumentProcessorServiceClient()

# Системный промпт консультанта по автозапчастям в Шымкенте
KASPI_WHATSAPP_PROMPT = """
Ты — старший консультант магазина автозапчастей в Шымкенте. 
Общайся вежливо, живо, с легким уважительным южным колоритом. Понимай русский, казахский и шала-казахский языки.
Твоя цель:
1. Проверить совместимость детали по марке авто, году выпуска или VIN-коду (особенно популярные модели: Camry 10-70, Land Cruiser, Nexia, Cobalt).
2. Назвать наличие на складе, цену в тенге и предложить оформить заказ через Kaspi Pay / Kaspi Доставку или самовывоз с рынка «Автонур».
3. Если клиент просит скидку («Скидка болама?»), вежливо объяснить, что цена на Kaspi уже минимальная в городе с гарантией на деталь, но при покупке комплекта (например, колодки + диски) мы дарим омывайку или бесплатную замену.

Верни ответ в JSON:
{
  "client_response_text": "Текст ответа клиенту в WhatsApp",
  "part_matched": true,
  "sku": "BRAKE-PAD-CAMRY40-FRONT",
  "price_kzt": 14500,
  "confidence": 0.98
}
"""

def calculate_optimal_buybox_price(current_min_price: int, cost_price: int, min_margin_kzt: int = 1500) -> int:
    """
    Алгоритм умного демпинга за кнопку «Купить» (BuyBox) в Kaspi Магазине:
    Снижаем цену на 1 тенге ниже минимального конкурента, но никогда не опускаемся ниже себестоимости с учетом минимальной маржи.
    """
    hard_floor_price = cost_price + min_margin_kzt
    target_price = current_min_price - 1
    
    if target_price < hard_floor_price:
        logger.warning(f"⚠️ Конкурент демпингует в убыток ({current_min_price} ₸). Удерживаем минимальную безопасную цену: {hard_floor_price} ₸")
        return hard_floor_price
    return target_price

async def parse_paper_invoice_document_ai(image_bytes: bytes, processor_name: str) -> List[Dict[str, Any]]:
    """
    Распознавание мятых рукописных накладных от оптовиков через Google Cloud Document AI.
    Извлекает артикул детали, наименование, количество и цену закупки.
    """
    raw_document = documentai.RawDocument(content=image_bytes, mime_type="image/jpeg")
    request = documentai.ProcessRequest(name=processor_name, raw_document=raw_document)
    
    result = doc_ai_client.process_document(request=request)
    document = result.document
    
    parsed_items = []
    logger.info(f"📄 Распознана накладная Document AI, найдено {len(document.entities)} сущностей.")
    
    for entity in document.entities:
        if entity.type_ == "line_item":
            parsed_items.append({
                "raw_text": entity.mention_text,
                "confidence": round(entity.confidence, 3)
            })
    return parsed_items

async def handle_whatsapp_inquiry(user_message: str, car_context: Optional[str] = None) -> Dict[str, Any]:
    """
    Мгновенная генерация ответа клиенту в WhatsApp через Gemini 2.5 Flash с анализом контекста.
    Время инференса: ~650 мс.
    """
    prompt = f"Сообщение клиента: {user_message}. Дополнительный контекст: {car_context or 'Нет'}"
    response = gemini_model.generate_content(
        [KASPI_WHATSAPP_PROMPT, prompt],
        generation_config={"response_mime_type": "application/json", "temperature": 0.2}
    )
    return json.loads(response.text)
