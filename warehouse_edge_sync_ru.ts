// ==============================================================================
// Warehouse Offline Buffer & Idempotent Firestore Sync (TypeScript)
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/warehouse_edge_sync_ru.ts
// ==============================================================================

/**
 * Промышленный сервис синхронизации мобильных результатов инвентаризации с Cloud Firestore.
 * Поддерживает работу в условиях нестабильной сети в ангарах, локальную буферизацию
 * и идемпотентное пакетное подтверждение (Batch Replay Prevention).
 * Разработано инженерной лабораторией OZAT (https://ozat.kz).
 */

import {
  Firestore,
  doc,
  runTransaction,
  serverTimestamp,
  increment,
  Timestamp
} from 'firebase/firestore';

export interface InventoryScanSession {
  warehouseId: string;
  zoneId: string;
  rackId: string;
  palletBarcode?: string;
  countedBoxes: number;
  scanDurationSeconds: number;
  operatorUid: string;
  deviceModel: string;
  clientBatchId: string; // Уникальный UUID для защиты от повторной записи при реконнекте
  hardwareInferenceAvgMs: number;
}

export interface SyncResult {
  success: boolean;
  rackTotalBoxes: number;
  syncedAt: string;
  alreadyProcessed: boolean;
}

/**
 * Идемпотентная транзакционная синхронизация пакета ревизии с Cloud Firestore.
 * Предотвращает дублирование счетчиков при повторной отправке из буфера при восстановлении сети.
 */
export async function syncInventorySession(
  db: Firestore,
  session: InventoryScanSession
): Promise<SyncResult> {
  const auditDocRef = doc(db, 'warehouse_audits', `${session.warehouseId}_${session.zoneId}_${session.clientBatchId}`);
  const rackSummaryRef = doc(db, 'warehouse_racks', `${session.warehouseId}_${session.rackId}`);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const auditSnapshot = await transaction.get(auditDocRef);
      
      // Проверка идемпотентности: если пакет уже был сохранен ранее, возвращаем статус без повторного инкремента
      if (auditSnapshot.exists()) {
        const existingData = auditSnapshot.data();
        return {
          success: true,
          rackTotalBoxes: existingData.countedBoxes,
          syncedAt: existingData.syncedAt?.toDate?.().toISOString() || new Date().toISOString(),
          alreadyProcessed: true
        };
      }

      // 1. Фиксация детальной сессии инспекции паллеты / стеллажа
      const auditPayload = {
        warehouseId: session.warehouseId,
        zoneId: session.zoneId,
        rackId: session.rackId,
        palletBarcode: session.palletBarcode || null,
        countedBoxes: session.countedBoxes,
        scanDurationSeconds: session.scanDurationSeconds,
        operatorUid: session.operatorUid,
        deviceModel: session.deviceModel,
        clientBatchId: session.clientBatchId,
        hardwareInferenceAvgMs: session.hardwareInferenceAvgMs,
        syncedAt: serverTimestamp(),
        auditStatus: 'VERIFIED_VERTEX_EDGE_AI',
        varianceStatus: 'AUTO_RECONCILED'
      };
      transaction.set(auditDocRef, auditPayload);

      // 2. Атомарное обновление агрегированных остатков по стеллажу
      transaction.set(
        rackSummaryRef,
        {
          warehouseId: session.warehouseId,
          rackId: session.rackId,
          lastAuditedAt: serverTimestamp(),
          lastOperatorUid: session.operatorUid,
          totalPhysicalBoxes: increment(session.countedBoxes),
          totalAuditSessions: increment(1)
        },
        { merge: true }
      );

      return {
        success: true,
        rackTotalBoxes: session.countedBoxes,
        syncedAt: new Date().toISOString(),
        alreadyProcessed: false
      };
    });

    console.log(`[OZAT-Sync] Стеллаж ${session.rackId} успешно синхронизирован (${session.countedBoxes} коробок).`);
    return result;
  } catch (error) {
    console.error(`[OZAT-Sync Error] Ошибка репликации сессии ${session.clientBatchId}:`, error);
    throw error;
  }
}
