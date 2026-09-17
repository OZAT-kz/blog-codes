// ==============================================================================
// Дашборд за 500 тысяч тенге: Как Скауту собрать сквозную аналитику для селлера, используя Looker Studio и Cloud Functions
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud_function_crm_to_bigquery_ru.ts
// ==============================================================================

import { BigQuery } from '@google-cloud/bigquery';
import axios from 'axios';
import { Request, Response } from 'express';

const bigquery = new BigQuery();
const datasetId = 'ecommerce_raw';
const tableId = 'crm_orders';

// Пример инкрементальной загрузки заказов
export const fetchOrdersToBQ = async (req: Request, res: Response) => {
  try {
    // 1. Получаем дату последнего обновления из BQ (High-water mark)
    const [lastSyncRows] = await bigquery.query(`
      SELECT MAX(updated_at) as last_sync 
      FROM \`ozatkz-project.${datasetId}.${tableId}\`
    `);
    
    const lastSyncDate = lastSyncRows[0]?.last_sync?.value 
      ? new Date(lastSyncRows[0].last_sync.value).toISOString()
      : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Fallback: 7 days

    console.log(`Fetching orders updated since: ${lastSyncDate}`);

    // 2. Делаем запрос к API источника (например, CRM)
    const response = await axios.get('https://api.example-crm.com/v1/orders', {
      headers: { 'Authorization': `Bearer ${process.env.CRM_API_KEY}` },
      params: { updated_after: lastSyncDate, limit: 1000 }
    });

    const orders = response.data.items;

    if (orders.length === 0) {
      return res.status(200).send('No new orders to sync.');
    }

    // 3. Форматируем данные для BigQuery
    const rowsToInsert = orders.map((order: any) => ({
      order_id: order.id,
      status: order.status,
      total_amount: order.price,
      created_at: bigquery.datetime(order.created_at),
      updated_at: bigquery.datetime(order.updated_at),
      raw_json: JSON.stringify(order) // Сохраняем сырой JSON на всякий случай
    }));

    // 4. Стримим данные в BigQuery
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
