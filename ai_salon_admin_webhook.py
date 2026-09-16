# ==============================================================================
# «Алло, на реснички есть места?»: Голосовой AI-администратор для салонов красоты Алматы, который не ходит на обед
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/ai_salon_admin_webhook.py
# ==============================================================================

import os
import json
from fastapi import FastAPI, Request
from google import genai
from google.genai import types
from google.oauth2 import service_account
from googleapiclient.discovery import build
from datetime import datetime, timedelta

app = FastAPI()

# Инициализация Gemini 2.5 Flash
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

# Инициализация Google Calendar API (предполагаем, что Service Account настроен)
creds = service_account.Credentials.from_service_account_file('gcp-calendar-sa.json', scopes=['https://www.googleapis.com/auth/calendar'])
calendar_service = build('calendar', 'v3', credentials=creds)
CALENDAR_ID = os.environ.get("CALENDAR_ID", "primary")

def check_availability(start_time_iso, end_time_iso):
    """Проверяет занятость слота в календаре (p95 latency ~150ms)."""
    events_result = calendar_service.events().list(
        calendarId=CALENDAR_ID, timeMin=start_time_iso, timeMax=end_time_iso,
        singleEvents=True, orderBy='startTime'
    ).execute()
    return len(events_result.get('items', [])) == 0

def book_appointment(client_name, service_name, start_time_iso, end_time_iso):
    """Бронирует слот."""
    event = {
        'summary': f"{service_name} - {client_name}",
        'start': {'dateTime': start_time_iso, 'timeZone': 'Asia/Almaty'},
        'end': {'dateTime': end_time_iso, 'timeZone': 'Asia/Almaty'},
    }
    calendar_service.events().insert(calendarId=CALENDAR_ID, body=event).execute()

@app.post("/webhook/whatsapp")
async def handle_whatsapp_message(request: Request):
    payload = await request.json()
    message = payload.get("message", "")
    
    # Промпт для Gemini 2.5 Flash. Мы используем System Instructions для жесткого формата
    prompt = f"""
    Ты - вежливый администратор салона красоты в Алматы.
    Сегодняшняя дата: {datetime.now().strftime("%Y-%m-%d %H:%M")}.
    Сообщение клиента: "{message}"
    Определи намерение. Если клиент хочет записаться, верни JSON:
    {{"intent": "book", "service": "услуга", "time_start": "ISO-8601"}}
    """
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            temperature=0.1
        )
    )
    
    data = json.loads(response.text)
    
    if data.get("intent") == "book":
        # Логика бронирования
        start_time = data["time_start"]
        end_time = (datetime.fromisoformat(start_time) + timedelta(hours=1)).isoformat()
        
        is_free = check_availability(start_time, end_time)
        if is_free:
            book_appointment("Клиент из WA", data["service"], start_time, end_time)
            return {"reply": f"Отлично! Записала вас на {data['service']} в {start_time}. Ждем!"}
        else:
            return {"reply": "К сожалению, это время уже занято. Предложить вам другое окошко?"}
            
    return {"reply": "Я вас не совсем поняла, переключаю на старшего администратора!"}
