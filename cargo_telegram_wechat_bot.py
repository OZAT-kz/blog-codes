# ==============================================================================
# FastAPI Webhook for Cargo Parsing
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cargo_telegram_wechat_bot.py
# ==============================================================================

from fastapi import FastAPI, UploadFile, File, HTTPException
import os
from google.cloud import firestore
from cargo_parser_service import process_cargo_waybill

app = FastAPI(title="OZAT Cargo Tracker API")
db = firestore.Client(database=os.environ.get("FIRESTORE_DATABASE", "(default)"))

@app.post("/api/v1/parse-waybill")
async def parse_waybill_endpoint(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only images are supported")
        
    image_bytes = await file.read()
    
    # Вызов конвейера Document AI + Gemini
    try:
        parsed_data = await process_cargo_waybill(image_bytes, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

    if "error" in parsed_data:
        raise HTTPException(status_code=422, detail="AI could not extract structured data")

    tracking_number = parsed_data.get("tracking_number")
    if not tracking_number:
        raise HTTPException(status_code=400, detail="Could not find tracking number on image")

    # Сохраняем результат в Firestore
    doc_ref = db.collection("cargo_waybills").document(tracking_number)
    doc_ref.set({
        "tracking_number": tracking_number,
        "client_code": parsed_data.get("client_code"),
        "courier": parsed_data.get("courier"),
        "weight_kg": parsed_data.get("weight_kg"),
        "description": parsed_data.get("description_ru"),
        "status": "ARRIVED_AT_WAREHOUSE",
        "created_at": firestore.SERVER_TIMESTAMP
    })

    return {
        "status": "success",
        "data": parsed_data,
        "message": f"Waybill {tracking_number} saved to database."
    }
