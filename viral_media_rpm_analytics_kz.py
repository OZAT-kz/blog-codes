# ==============================================================================
# Вирустық Reels-ті AdSense арқылы монетизациялау («Күңгірт» схемаларсыз ақ арбитраж)
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/viral_media_rpm_analytics_kz.py
# ==============================================================================

from fastapi import FastAPI, Request, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Viral Media RPM Analytics")

class AttributionEvent(BaseModel):
    reels_id: str
    traffic_source: str
    user_agent: str
    dwell_time_seconds: float
    ad_impressions: int

@app.post("/api/v1/track-engagement")
async def track_engagement(event: AttributionEvent):
    if event.dwell_time_seconds < 4.0:
        return {"status": "ignored", "reason": "bounce_too_fast"}
    
    estimated_revenue_usd = (event.ad_impressions / 1000.0) * 2.40
    
    return {
      "status": "recorded",
      "reels_id": event.reels_id,
      "valid_impression": True,
      "estimated_yield_usd": round(estimated_revenue_usd, 4)
    }
