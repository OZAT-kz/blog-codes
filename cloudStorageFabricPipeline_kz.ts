// ==============================================================================
// Қалдықсыз пішу: Алматыдағы 12 тігіншісі бар шеберхана Gemini 2.5 Flash (Vision) және Cloud Storage арқылы матадан 800 000 ₸ қалай үнемдейді
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloudStorageFabricPipeline_kz.ts
// ==============================================================================

import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { analyzeFabricSurface, DefectScanResult } from './geminiFabricDefectVision';

const storage = new Storage();
const pubsub = new PubSub();

const FABRIC_BUCKET_NAME = process.env.FABRIC_IMAGES_BUCKET || 'ozat-almaty-sewing-fabrics-prod';
const NOTIFICATION_TOPIC = 'projects/ozat-almaty-sewing/topics/fabric-frame-uploaded';

/**
 * Генерация V4 Signed URL для мгновенной загрузки 4K-снимка напрямую с промышленной камеры
 */
export async function generateCameraUploadUrl(rollId: string, frameIndex: number): Promise<{ uploadUrl: string; gcsUri: string; fileKey: string }> {
  const fileKey = `rolls/${rollId}/frame_${String(frameIndex).padStart(5, '0')}_${Date.now()}.jpg`;
  const file = storage.bucket(FABRIC_BUCKET_NAME).file(fileKey);

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 10 * 60 * 1000, // 10 минут
    contentType: 'image/jpeg',
  });

  const gcsUri = `gs://${FABRIC_BUCKET_NAME}/${fileKey}`;
  return { uploadUrl, gcsUri, fileKey };
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
