# ==============================================================================
# FastAPI Webhook for Telegram VTON
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/telegram_vton_bot.py
# ==============================================================================

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import Response
import os
from vton_service import generate_virtual_tryon
from masking_service import generate_auto_mask # Гипотетический сервис (например, SAM)

app = FastAPI(title="OZAT VTON Bot API")

@app.post("/api/v1/try-on")
async def virtual_try_on_endpoint(
    photo: UploadFile = File(...),
    garment_description: str = Form(...)
):
    """
    Эндпоинт для Telegram-бота: принимает фото клиентки и текстовое описание одежды.
    Возвращает сгенерированное фото (JPEG).
    """
    if not photo.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Только изображения")
        
    client_image_bytes = await photo.read()
    
    # 1. Автоматическая генерация маски (сегментация текущей одежды)
    # В production здесь вызывается легковесная модель типа U-Net или Segment Anything (SAM)
    mask_bytes = await generate_auto_mask(client_image_bytes)
    
    if not mask_bytes:
        raise HTTPException(status_code=422, detail="Не удалось выделить силуэт одежды")

    # 2. Вызов Vertex AI Imagen 3
    result_bytes = generate_virtual_tryon(
        client_image_bytes=client_image_bytes,
        mask_bytes=mask_bytes,
        garment_prompt=f"A highly photorealistic full-body shot. The person is wearing {garment_description}. Perfect fit, studio lighting, highly detailed fabric texture, no artifacts."
    )

    if not result_bytes:
        raise HTTPException(status_code=500, detail="Ошибка генерации Imagen 3")

    return Response(content=result_bytes, media_type="image/jpeg")
