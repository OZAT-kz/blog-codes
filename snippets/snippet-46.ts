// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// Cloud Function: Синхронизация BigQuery -> Firebase Auth
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
