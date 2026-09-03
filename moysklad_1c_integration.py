# ==============================================================================
# Fuzzy Search and CRM Integration (MoySklad)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/moysklad_1c_integration.py
# ==============================================================================

import os
import httpx
from typing import Dict, Any

MOYSKLAD_TOKEN = os.environ.get("MOYSKLAD_API_TOKEN")

async def push_to_moysklad(phone: str, order_data: Dict[str, Any]) -> str:
    """
    Создает карточку Заказа Покупателя в МойСклад.
    Реализует паттерн Fuzzy Search для сопоставления номенклатуры из аудио с базой.
    """
    async with httpx.AsyncClient(
        base_url="https://api.moysklad.ru/api/remap/1.2/",
        headers={"Authorization": f"Bearer {MOYSKLAD_TOKEN}"}
    ) as client:
        
        # 1. Поиск или создание контрагента по номеру телефона
        agent_res = await client.get(f"entity/counterparty?filter=phone={phone}")
        agents = agent_res.json().get("rows", [])
        
        if agents:
            agent_meta = agents[0]["meta"]
        else:
            new_agent = await client.post("entity/counterparty", json={
                "name": order_data.get("customer_name") or f"Клиент {phone}",
                "phone": phone
            })
            agent_meta = new_agent.json()["meta"]

        # 2. Мэппинг товаров (Fuzzy Search по названию)
        positions = []
        for item in order_data.get("items", []):
            # Простой поиск. В production лучше использовать векторный поиск (Vertex AI) для сложных совпадений
            search_res = await client.get(f"entity/assortment?search={item['name']}&limit=1")
            products = search_res.json().get("rows", [])
            
            if products:
                positions.append({
                    "quantity": item["quantity"],
                    "assortment": {"meta": products[0]["meta"]}
                })
            else:
                # Товар не найден, можно добавить как услугу или кинуть алерт
                pass

        # 3. Создание Заказа Покупателя
        order_payload = {
            "organization": {"meta": {"href": "YOUR_ORG_META_HREF", "type": "organization", "mediaType": "application/json"}},
            "agent": {"meta": agent_meta},
            "shipmentAddress": order_data.get("delivery_address", ""),
            "description": f"Аудио-заказ. Срочность: {order_data.get('urgency')}. Коммент: {order_data.get('comments')}",
            "positions": positions
        }
        
        order_res = await client.post("entity/customerorder", json=order_payload)
        
        return order_res.json().get("name", "NEW")
