// ==============================================================================
// Firebase Cloud Function for Emergency Client Restoration
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/firebase-sms-migration-sync.ts
// ==============================================================================

import { onRequest } from 'firebase-functions/v2/https';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const auth = getAuth();
const db = getFirestore();

interface ClientRestorePayload {
  phoneNumber: string; // Формат: +7701XXXXXXX
  fullName: string;
  membershipPlanId: string;
  sourceBackupDate: string;
}

export const restoreClientsBatch = onRequest(
  { cors: true, region: 'europe-west1', maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const { clients, secretToken } = req.body;
    if (secretToken !== process.env.DISASTER_RECOVERY_KEY) {
      res.status(403).json({ error: 'Рұқсат етілмеген сұраныс' });
      return;
    }

    const batch = db.batch();
    const results = { imported: 0, failed: 0 };

    for (const client of (clients as ClientRestorePayload[])) {
      try {
        let userRecord;
        try {
          userRecord = await auth.getUserByPhoneNumber(client.phoneNumber);
        } catch {
          userRecord = await auth.createUser({
            phoneNumber: client.phoneNumber,
            displayName: client.fullName
          });
        }

        const userRef = db.collection('clients').doc(userRecord.uid);
        batch.set(userRef, {
          uid: userRecord.uid,
          phoneNumber: client.phoneNumber,
          fullName: client.fullName,
          membershipPlanId: client.membershipPlanId,
          restoredAt: FieldValue.serverTimestamp(),
          status: 'active',
          accountType: 'pwa_member'
        }, { merge: true });

        results.imported++;
      } catch (err) {
        console.error('Клиентті қалпына келтіру қатесі:', client.phoneNumber, err);
        results.failed++;
      }
    }

    await batch.commit();
    res.json({ success: true, results });
  }
);
