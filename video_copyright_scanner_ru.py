# ==============================================================================
# ИИ-щит от банов за авторские права и DMCA: премодерация медиа на Google Cloud Video Intelligence, Chromaprint и Gemini 2.5 Flash
# Source: OZAT Engineering Hub (https://ozat.kz)
# GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/video_copyright_scanner_ru.py
# ==============================================================================

import os
import subprocess
from google.cloud import videointelligence_v1 as videointelligence

def extract_audio_fingerprint(video_path: str) -> str:
    """Генерирует Chromaprint хэш аудиодорожки через fpcalc"""
    cmd = ["fpcalc", "-raw", "-length", "120", video_path]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
    for line in result.stdout.splitlines():
        if line.startswith("FINGERPRINT="):
            return line.split("=")[1]
    return ""

def scan_video_for_brand_logos(gcs_uri: str):
    """Обнаруживает логотипы брендов в видеоряде через Google Cloud Video Intelligence"""
    client = videointelligence.VideoIntelligenceServiceClient()
    features = [videointelligence.Feature.LOGO_RECOGNITION]
    
    operation = client.annotate_video(
        request={
            "features": features,
            "input_uri": gcs_uri,
        }
    )
    print(f"Обработка видео {gcs_uri} запущена в Cloud Video Intelligence...")
    result = operation.result(timeout=180)
    
    detected_logos = []
    annotation_results = result.annotation_results[0]
    for logo in annotation_results.logo_recognition_annotations:
        entity = logo.entity.description
        for track in logo.tracks:
            start_time = track.segment.start_time_offset.total_seconds()
            end_time = track.segment.end_time_offset.total_seconds()
            confidence = track.confidence
            detected_logos.append({
                "brand": entity,
                "start": start_time,
                "end": end_time,
                "confidence": round(confidence, 3)
            })
    return detected_logos
