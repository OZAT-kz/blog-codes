// ==============================================================================
// Инвентаризация за перекур: Считаем 5 000 коробок на складе через смартфон с Vertex AI Edge (LiteRT / TFLite) и Cloud Firestore
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/warehouse_firestore_sync_ru.ts
// ==============================================================================

import { Firestore, FieldValue, Timestamp } from '@google-cloud/firestore';
import { v4 as uuidv4 } from 'uuid';

const firestore = new Firestore({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'ozat-warehouse-prod',
  databaseId: process.env.FIRESTORE_DATABASE_ID || '(default)'
});

export interface InventoryScanBatch {
  clientBatchId: string;       // Unique UUID v4 generated on mobile edge device
  warehouseId: string;         // E.g., 'wh-almaty-ryskulova-01'
  aisleZone: string;           // E.g., 'rack-row-B4-tier2'
  skuCategory: string;         // E.g., 'footwear-sport-sneakers'
  countedBoxes: number;        // Total confirmed boxes from LiteRT tracker
  operatorId: string;          // Employee identifier
  scannedAtIso: string;        // Edge scan timestamp
  confidenceScoreAvg: number;  // Optical detector confidence mean
}

export interface SyncResponse {
  success: boolean;
  status: 'PROCESSED' | 'DUPLICATE_IGNORED' | 'ERROR';
  batchId: string;
  totalRackCount: number;
  syncedAt: string;
}

/**
 * Idempotently syncs offline warehouse scan batches into Cloud Firestore.
 * Prevents double-accounting when edge devices retry over unstable Wi-Fi.
 */
export async function syncWarehouseBatch(batch: InventoryScanBatch): Promise<SyncResponse> {
  const idempotencyRef = firestore.collection('idempotency_keys').doc(batch.clientBatchId);
  const warehouseRackRef = firestore
    .collection('warehouses')
    .doc(batch.warehouseId)
    .collection('inventory_racks')
    .doc(batch.aisleZone);

  const auditLogRef = firestore.collection('inventory_audit_logs').doc();

  try {
    const result = await firestore.runTransaction(async (transaction) => {
      // Step 1: Idempotency Lock Check
      const idempotencyDoc = await transaction.get(idempotencyRef);
      if (idempotencyDoc.exists) {
        const existingData = idempotencyDoc.data();
        console.warn(`[IDEMPOTENCY] Batch ${batch.clientBatchId} was already synced at ${existingData?.processedAt?.toDate()}`);
        return {
          success: true,
          status: 'DUPLICATE_IGNORED' as const,
          batchId: batch.clientBatchId,
          totalRackCount: existingData?.recordedRackTotal || 0,
          syncedAt: existingData?.processedAt?.toDate()?.toISOString() || new Date().toISOString()
        };
      }

      // Step 2: Read current rack state or initialize
      const rackDoc = await transaction.get(warehouseRackRef);
      const currentRackBoxes = rackDoc.exists ? (rackDoc.data()?.totalBoxes || 0) : 0;
      const newTotal = currentRackBoxes + batch.countedBoxes;

      // Step 3: Atomic Mutation of Rack Inventory
      transaction.set(warehouseRackRef, {
        aisleZone: batch.aisleZone,
        skuCategory: batch.skuCategory,
        totalBoxes: newTotal,
        lastOperatorId: batch.operatorId,
        lastConfidenceScore: batch.confidenceScoreAvg,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      // Step 4: Write Immutable Audit Log
      transaction.set(auditLogRef, {
        auditId: auditLogRef.id,
        batchId: batch.clientBatchId,
        warehouseId: batch.warehouseId,
        aisleZone: batch.aisleZone,
        addedBoxes: batch.countedBoxes,
        resultingTotal: newTotal,
        operatorId: batch.operatorId,
        scannedAt: Timestamp.fromDate(new Date(batch.scannedAtIso)),
        syncedAt: FieldValue.serverTimestamp()
      });

      // Step 5: Seal Idempotency Key
      transaction.set(idempotencyRef, {
        batchId: batch.clientBatchId,
        warehouseId: batch.warehouseId,
        aisleZone: batch.aisleZone,
        recordedRackTotal: newTotal,
        processedAt: FieldValue.serverTimestamp()
      });

      return {
        success: true,
        status: 'PROCESSED' as const,
        batchId: batch.clientBatchId,
        totalRackCount: newTotal,
        syncedAt: new Date().toISOString()
      };
    });

    return result;
  } catch (error: any) {
    console.error(`[SYNC_ERROR] Failed to sync batch ${batch.clientBatchId}:`, error);
    throw new Error(`Firestore transactional sync failed: ${error.message}`);
  }
}
