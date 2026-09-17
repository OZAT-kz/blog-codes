// ==============================================================================
// 500 мың теңгенің дашборды: Скаут Looker Studio мен Cloud Functions арқылы селлерге өтпелі аналитиканы қалай жинай алады
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud_function_crm_to_bigquery_kz.ts
// ==============================================================================

import { BigQuery } from '@google-cloud/bigquery';
import axios from 'axios';
import { Request, Response } from 'express';

const bigquery = new BigQuery();
const datasetId = 'ecommerce_raw';
const tableId = 'crm_orders';

// Тапсырыстарды инкременталды жүктеу мысалы
export const fetchOrdersToBQ = async (req: Request, res: Response) => {
  try {
    // 1. BQ-дан соңғы жаңарту күнін аламыз (High-water mark)
    const [lastSyncRows] = await bigquery.query(`
      SELECT MAX(updated_at) as last_sync 
      FROM \`ozatkz-project.${datasetId}.${tableId}\`
    `);
    
    const lastSyncDate = lastSyncRows[0]?.last_sync?.value 
      ? new Date(lastSyncRows[0].last_sync.value).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Fallback: 7 күн

    console.log(`Fetching orders updated since: ${lastSyncDate}`);

    // 2. Көздің API-іне сұрау жасаймыз (мысалы, CRM)
    const response = await axios.get('https://api.example-crm.com/v1/orders', {
      headers: { 'Authorization': `Bearer ${process.env.CRM_API_KEY}` },
      params: { updated_after: lastSyncDate, limit: 1000 }
    });

    const orders = response.data.items;

    if (orders.length === 0) {
      return res.status(200).send('No new orders to sync.');
    }

    // 3. Деректерді BigQuery үшін форматтаймыз
    const rowsToInsert = orders.map((order: any) => ({
      order_id: order.id,
      status: order.status,
      total_amount: order.price,
      created_at: bigquery.datetime(order.created_at),
      updated_at: bigquery.datetime(order.updated_at),
      raw_json: JSON.stringify(order) // Қандай жағдай болмасын шикі JSON-ды сақтаймыз
    }));

    // 4. Деректерді BigQuery-ге стриминг жасаймыз
    await bigquery
      .dataset(datasetId)
      .table(tableId)
      .insert(rowsToInsert);

    res.status(200).send(`Successfully synced ${orders.length} orders.`);
  } catch (error) {
    console.error('Error syncing orders:', error);
    res.status(500).send('Internal Server Error');
  }
};
