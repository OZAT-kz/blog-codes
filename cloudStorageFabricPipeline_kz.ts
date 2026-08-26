// ==============================================================================
// Cloud Storage & Cloud Run Fabric Pipeline (KZ)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloudStorageFabricPipeline_kz.ts
// ==============================================================================

import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { analyzeFabricSurface, DefectScanResult } from './geminiFabricDefectVision_kz';

const storage = new Storage();
const pubsub = new PubSub();

const BUCKET_NAME = process.env.FABRIC_PHOTOS_BUCKET || 'almaty-garment-fabric-scans-prod';
const NOTIFICATION_TOPIC = process.env.DEFECT_EVENTS_TOPIC || 'fabric-defect-detected-topic';

/**
 * Пішу үстелінің камерасынан 4K кадрды тікелей жүктеу үшін V4 Signed URL жасау
 */
export async function generateUploadUrl(rollId: string, cameraIndex: number): Promise<{ uploadUrl: string; gcsPath: string }> {
  const timestamp = Date.now();
  const fileName = `rolls/${rollId}/cam_${cameraIndex}_${timestamp}.jpg`;
  const file = storage.bucket(BUCKET_NAME).file(fileName);

  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 5 * 60 * 1000, // 5 минут жарамдылық
    contentType: 'image/jpeg'
  });

  return {
    uploadUrl,
    gcsPath: `gs://${BUCKET_NAME}/${fileName}`
  };
}

/**
 * Cloud Storage жүктеу оқиғасын өңдегіш (Event-Driven Cloud Run Handler)
 */
export async function handleGcsFabricUploadEvent(eventPayload: { bucket: string; name: string }): Promise<void> {
  const { bucket, name } = eventPayload;
  console.log(`[GCS Event] Матаның жаңа 4K суреті: gs://${bucket}/${name}`);

  // Файл жолынан rollId бөліп алу
  const match = name.match(/^rolls\/([^\/]+)\//);
  const rollId = match ? match[1] : 'unknown_roll';

  const gcsUri = `gs://${bucket}/${name}`;
  
  // Gemini 2.5 Flash Vision шақыру
  const scanResult: DefectScanResult = await analyzeFabricSurface(gcsUri, {
    rollId,
    expectedColor: 'Navy Blue #1A243B',
    gsmWeight: 320
  });

  console.log(`[Defect Engine] Сканерлеу нәтижесі ${name}: ${scanResult.defects.length} ақау. Грейд: ${scanResult.overallQualityGrade}`);

  // Координаттарды лекалоларды динамикалық орналастыру алгоритміне жіберу
  const messageData = Buffer.from(JSON.stringify({
    gcsUri,
    rollId,
    timestamp: Date.now(),
    scanResult
  }));

  await pubsub.topic(NOTIFICATION_TOPIC).publishMessage({ data: messageData });
}
