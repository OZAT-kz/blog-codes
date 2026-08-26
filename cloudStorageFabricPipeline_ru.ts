// ==============================================================================
// Cloud Storage & Cloud Run Fabric Pipeline (RU)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloudStorageFabricPipeline_ru.ts
// ==============================================================================

import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { analyzeFabricSurface, DefectScanResult } from './geminiFabricDefectVision_ru';

const storage = new Storage();
const pubsub = new PubSub();

const BUCKET_NAME = process.env.FABRIC_PHOTOS_BUCKET || 'almaty-garment-fabric-scans-prod';
const NOTIFICATION_TOPIC = process.env.DEFECT_EVENTS_TOPIC || 'fabric-defect-detected-topic';

/**
 * Генерация V4 Signed URL для прямой скоростной загрузки 4K-снимка с камеры раскройного стола
 */
export async function generateUploadUrl(rollId: string, cameraIndex: number): Promise<{ uploadUrl: string; gcsPath: string }> {
  const timestamp = Date.now();
  const fileName = `rolls/${rollId}/cam_${cameraIndex}_${timestamp}.jpg`;
  const file = storage.bucket(BUCKET_NAME).file(fileName);

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 5 * 60 * 1000, // 5 минут валидности
    contentType: 'image/jpeg'
  });

  return {
    uploadUrl,
    gcsPath: `gs://${BUCKET_NAME}/${fileName}`
  };
}

/**
 * Обработчик события финализации загрузки в Cloud Storage (Event-Driven Cloud Run Handler)
 */
export async function handleGcsFabricUploadEvent(eventPayload: { bucket: string; name: string }): Promise<void> {
  const { bucket, name } = eventPayload;
  console.log(`[GCS Event] Новый 4K-кадр полотна: gs://${bucket}/${name}`);

  // Извлекаем rollId из пути файла
  const match = name.match(/^rolls\/([^\/]+)\//);
  const rollId = match ? match[1] : 'unknown_roll';

  const gcsUri = `gs://${bucket}/${name}`;
  
  // Вызов Gemini 2.5 Flash Vision
  const scanResult: DefectScanResult = await analyzeFabricSurface(gcsUri, {
    rollId,
    expectedColor: 'Navy Blue #1A243B',
    gsmWeight: 320
  });

  console.log(`[Defect Engine] Результат сканирования ${name}: ${scanResult.defects.length} дефектов. Grade: ${scanResult.overallQualityGrade}`);

  // Отправка координат в алгоритм динамического нестинга лекал (Nesting Engine)
  const messageData = Buffer.from(JSON.stringify({
    gcsUri,
    rollId,
    timestamp: Date.now(),
    scanResult
  }));

  await pubsub.topic(NOTIFICATION_TOPIC).publishMessage({ data: messageData });
}
