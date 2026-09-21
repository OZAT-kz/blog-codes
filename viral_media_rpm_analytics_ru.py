# ==============================================================================
# Монетизация вирусных Reels через AdSense (Арбитраж без «серых» схем)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/viral_media_rpm_analytics_ru.py
# ==============================================================================

from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel
import time

app = FastAPI(title="Viral Media RPM Analytics")

class AttributionEvent(BaseModel):
    reels_id: str
    traffic_source: str # instagram_reels, tiktok, youtube_shorts
    user_agent: str
    dwell_time_seconds: float
    ad_impressions: int

@app.post("/api/v1/track-engagement")
async def track_engagement(event: AttributionEvent):
    # Отсекаем фрод: если время на странице меньше 4 секунд — это мусорный переход
    if event.dwell_time_seconds < 4.0:
        return {"status": "ignored", "reason": "bounce_too_fast"}
    
    # Рассчитываем ориентировочную ценность сессии
    # Средний базовый eCPM для качественного трафика tier-1/tier-2 составляет $2.40
    estimated_revenue_usd = (event.ad_impressions / 1000.0) * 2.40
    
    # Логика сохранения метрик в BigQuery для дальнейшего FinOps-анализа
    return {
      "status": "recorded",
      "reels_id": event.reels_id,
      "valid_impression": True,
      "estimated_yield_usd": round(estimated_revenue_usd, 4)
    }
