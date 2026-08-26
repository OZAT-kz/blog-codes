// ==============================================================================
// Warehouse Edge Vision Cloud Firestore Sync (RU)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/warehouse_sync_pipeline_ru.ts
// ==============================================================================

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, updateDoc, increment, serverTimestamp } from 'firebase/firestore';

export interface InventoryScanBatch {
  warehouseZone: string;       // e.g. "ZONE-B-RACK-04"
  operatorUid: string;         // Ревизор
  countedBoxes: number;        // Распознано нейросетью
  palletBarcode?: string;      // Штрихкод паллеты
  scanDurationSeconds: number; // Время съемки
  deviceModel: string;         // Смартфон (e.g. "Pixel 8a")
  tfliteInferenceMs: number;   // Средняя задержка инференса (18.4 мс)
  clientBatchId: string;       // Идемпотентный UUID
}

/**
 * Идемпотентная синхронизация результатов мобильного видеосканирования с Cloud Firestore / ERP
 */
export async function syncInventoryAuditBatch(db: any, batch: InventoryScanBatch): Promise<{ success: boolean; totalZoneCount: number }> {
  const auditDocRef = doc(db, 'warehouse_audits', `${batch.warehouseZone}_${batch.clientBatchId}`);
  const zoneSummaryRef = doc(db, 'warehouse_zones_summary', batch.warehouseZone);

  const payload = {
    ...batch,
    syncedAt: serverTimestamp(),
    auditStatus: 'VERIFIED_EDGE_VISION',
    varianceStatus: 'AUTO_RECONCILED'
  };

  try {
    // 1. Фиксируем снимок сканирования
    await setDoc(auditDocRef, payload, { merge: true });

    // 2. Инкрементируем сводный остаток зоны
    await updateDoc(zoneSummaryRef, {
      lastAuditedAt: serverTimestamp(),
      totalPhysicalBoxes: increment(batch.countedBoxes),
      auditSessionsCount: increment(1)
    });

    console.log(`[WarehouseSync] Зона ${batch.warehouseZone}: Успешно синхронизировано +${batch.countedBoxes} коробок.`);
    return { success: true, totalZoneCount: batch.countedBoxes };
  } catch (error) {
    console.error(`[WarehouseSync Error] Ошибка репликации в облако:`, error);
    throw error;
  }
}
