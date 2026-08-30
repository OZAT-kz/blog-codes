// ==============================================================================
// Paywall или AdSense? Как мы динамически скрывали рекламу от «китов» с помощью Firebase и Google Analytics
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/sync-bigquery-firebase-claims.ts
// ==============================================================================

import * as admin from 'firebase-admin';
import { BigQuery } from '@google-cloud/bigquery';

const bq = new BigQuery();

exports.syncWhalesToAuth = functions.pubsub.schedule('every 24 hours').onRun(async (context) => {
    const query = `SELECT user_id, segment FROM `my_project.marts.user_segments` WHERE segment = 'High'`;
    const [rows] = await bq.query(query);

    for (const row of rows) {
        // Устанавливаем Custom Claim 'is_whale' = true
        await admin.auth().setCustomUserClaims(row.user_id, { is_whale: true });
    }
    console.log(`Синхронизировано ${rows.length} китов.`);
});
