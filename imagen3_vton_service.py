# ==============================================================================
# Vertex AI Imagen 3 Virtual Try-On Pipeline
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/imagen3_vton_service.py
# ==============================================================================

import os
import logging
from typing import Optional
import vertexai
from vertexai.preview.vision_models import ImageGenerationModel, Image as VertexImage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Инициализация Vertex AI
PROJECT_ID = os.environ.get("GOOGLE_CLOUD_PROJECT", "ozat-cloud-kz")
LOCATION = os.environ.get("VERTEX_LOCATION", "us-central1")
vertexai.init(project=PROJECT_ID, location=LOCATION)

# Загрузка модели Imagen 3
# Используем latest версию для генерации и inpainting
generation_model = ImageGenerationModel.from_pretrained("imagen-3.0-generate-001")

def generate_virtual_tryon(
    client_image_bytes: bytes, 
    mask_bytes: bytes, 
    garment_prompt: str
) -> Optional[bytes]:
    """
    Пайплайн Virtual Try-On (VTON) на базе Imagen 3 Edit API (Inpainting).
    :param client_image_bytes: Исходное фото клиента.
    :param mask_bytes: Маска старой одежды (белый цвет - зона замены, черный - фон).
    :param garment_prompt: Детальное описание новой вещи.
    """
    try:
        base_img = VertexImage(client_image_bytes)
        mask_img = VertexImage(mask_bytes)
        
        logger.info(f"Запуск Imagen 3 Inpainting с промптом: {garment_prompt}")
        
        # Inpainting-insert позволяет модели гармонично "вписать" новую текстуру 
        # с учетом освещения и теней базового фото
        response = generation_model.edit_image(
            base_image=base_img,
            mask=mask_img,
            prompt=garment_prompt,
            edit_mode="inpainting-insert",
            guidance_scale=21, # Высокий guidance для точного следования промпту
            number_of_images=1
        )
        
        if not response.images:
            logger.error("Imagen 3 не вернул изображений (возможно сработал фильтр безопасности).")
            return None
            
        return response.images[0]._image_bytes

    except Exception as e:
        logger.error(f"Ошибка вызова Vertex AI: {str(e)}")
        return None
