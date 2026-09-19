// ==============================================================================
// Бан Директа в пятницу вечером: Как за 15 минут поднять аварийный Web-каталог на Cloud Run, пока Instagram-магазин в нокауте
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/emergency_catalog_failover_service_ru.ts
// ==============================================================================

import fastify from 'fastify';
import { Firestore } from '@google-cloud/firestore';
import axios from 'axios';

const server = fastify({ logger: true });
const firestore = new Firestore();

interface CheckoutRequest {
  sku_id: string;
  customer_phone: string;
  customer_name: string;
  size: string;
}

// 1. Быстрая отдача каталога из кэша Firestore
server.get('/api/catalog', async (req, reply) => {
  reply.header('Cache-Control', 'public, max-age=60, s-maxage=300');
  
  const snapshot = await firestore
    .collection('emergency_catalog')
    .where('is_in_stock', '==', true)
    .select('sku_id', 'title', 'price', 'sizes', 'image_url')
    .get();

  const products = snapshot.docs.map(doc => doc.data());
  return reply.send({ count: products.length, items: products });
});

// 2. Генерация платежного инвойса Kaspi Pay
server.post<{ Body: CheckoutRequest }>('/api/checkout', async (req, reply) => {
  const { sku_id, customer_phone, customer_name, size } = req.body;

  if (!sku_id || !customer_phone) {
    return reply.status(400).send({ error: 'Missing required parameters' });
  }

  // Получаем актуальную цену из базы
  const productDoc = await firestore.collection('emergency_catalog').doc(sku_id).get();
  if (!productDoc.exists) {
    return reply.status(404).send({ error: 'Product not found' });
  }
  const product = productDoc.data()!;

  const orderId = `EMG-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

  // Формируем заказ в Firestore
  await firestore.collection('emergency_orders').doc(orderId).set({
    order_id: orderId,
    sku_id,
    title: product.title,
    price: product.price,
    size,
    customer_phone,
    customer_name,
    status: 'PENDING_PAYMENT',
    created_at: new Date().toISOString()
  });

  // Эмулируем генерацию Kaspi Pay Payment Link
  const kaspiPaymentUrl = `https://kaspi.kz/pay/brand_shop?order_id=${orderId}&amount=${product.price}`;

  return reply.send({
    success: true,
    order_id: orderId,
    payment_url: kaspiPaymentUrl
  });
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8080');
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Emergency catalog running on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
