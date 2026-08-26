// ==============================================================================
// Warehouse Offline Buffer & Idempotent Firestore Sync (TypeScript - KZ)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/warehouse_edge_sync_kz.ts
// ==============================================================================

/**
 * Қоймадағы түгендеу нәтижелерін Cloud Firestore-мен үндестірудің өндірістік сервисі.
 * Металл ангарлардағы байланыс үзілістерінде жұмыс істеуді, локалды буферлеуді
 * және қайта жазылудан қорғайтын идемпотентті транзакцияларды қолдайды.
 * OZAT инженерлік зертханасы (https://ozat.kz) әзірлеген.
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
  clientBatchId: string; // Байланыс қайта қосылғанда қайта санаудан қорғайтын бірегей UUID
  hardwareInferenceAvgMs: number;
}

export interface SyncResult {
  success: boolean;
  rackTotalBoxes: number;
  syncedAt: string;
  alreadyProcessed: boolean;
}

/**
 * Ревизия пакетін Cloud Firestore-ға идемпотентті транзакциялық синхрондау.
 * Оффлайн буферден қайта жіберу кезінде қалдықтардың екі рет қосылуына жол бермейді.
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
      
      // Идемпотенттілік тексерісі: егер бұл пакет бұрын жазылған болса, есепті қайта арттырмаймыз
      if (auditSnapshot.exists()) {
        const existingData = auditSnapshot.data();
        return {
          success: true,
          rackTotalBoxes: existingData.countedBoxes,
          syncedAt: existingData.syncedAt?.toDate?.().toISOString() || new Date().toISOString(),
          alreadyProcessed: true
        };
      }

      // 1. Паллета / сөре ревизиясының толық дерегін жазу
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

      // 2. Сөре бойынша жалпы жиынтық қалдықты атомарлы жаңарту
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

    console.log(`[OZAT-Sync] ${session.rackId} сөресі сәтті үндестірілді (${session.countedBoxes} қорап).`);
    return result;
  } catch (error) {
    console.error(`[OZAT-Sync Қатесі] ${session.clientBatchId} сессиясын репликациялау қатесі:`, error);
    throw error;
  }
}
