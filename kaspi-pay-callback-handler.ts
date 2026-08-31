// ==============================================================================
// Kaspi Pay Webhook Callback & Instant Order Fulfillment
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/kaspi-pay-callback-handler.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';

const router = express.Router();
const db = getFirestore();

interface KaspiPaymentCallback {
  TranId: string;
  OrderId: string;
  Amount: number;
  Status: 'Success' | 'Failure' | 'Refund';
  Signature: string;
}

router.post('/api/kaspi/callback', async (req: Request, res: Response) => {
  const payload = req.body as KaspiPaymentCallback;
  console.log(`[Kaspi Callback] Order: ${payload.OrderId}, Status: ${payload.Status}, Amount: ${payload.Amount} KZT`);

  if (payload.Status !== 'Success') {
    return res.status(200).json({ status: 'IGNORED' });
  }

  const orderRef = db.collection('orders').doc(payload.OrderId);
  
  await db.runTransaction(async (transaction) => {
    const orderDoc = await transaction.get(orderRef);
    if (!orderDoc.exists) {
      throw new Error(`Order ${payload.OrderId} not found`);
    }

    const orderData = orderDoc.data()!;
    if (orderData.status === 'PAID') {
      return; // Идемпотентность: платеж уже обработан
    }

    // 1. Переводим заказ в статус PAID
    transaction.update(orderRef, {
      status: 'PAID',
      kaspiTranId: payload.TranId,
      paidAt: new Date()
    });

    // 2. Декрементируем остаток товара в каталоге
    const productRef = db.collection('products').doc(orderData.sku);
    transaction.update(productRef, {
      [`stock.${orderData.size}`]: (orderData.currentStock || 1) - 1
    });
  });

  // 3. Отправляем подтверждение покупателю в Instagram Direct
  const orderData = (await orderRef.get()).data()!;
  await sendInstagramDirectMessage(
    orderData.instagramUserId,
    `✅ Оплата ${payload.Amount.toLocaleString('ru-KZ')} ₸ успешно получена! Чек Kaspi #${payload.TranId}.
📦 Мы упаковываем ваш заказ (${orderData.size}). Курьер Яндекс Доставки привезет его сегодня до 18:00!`
  );

  return res.status(200).json({ status: 'PROCESSED' });
});

export default router;
