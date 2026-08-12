// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// index.js для Google Cloud Functions (Node.js)
const fetch = require('node-fetch');
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

const SGTM_URL = 'https://sgtm.yourdomain.kz/kaspi-webhook'; // URL вашего Server-Side GTM

exports.handleKaspiWebhook = async (req, res) => {
  try {
    // 1. Проверяем подпись вебхука от Kaspi (Security First!)
    if (!verifyKaspiSignature(req)) {
      return res.status(403).send('Forbidden');
    }

    const { order_id, status, amount } = req.body;

    // 2. Обрабатываем только успешные оплаты
    if (status !== 'PAID') {
      return res.status(200).send('OK');
    }

    // 3. Достаем заказ из базы данных
    const orderDoc = await db.collection('orders').doc(order_id).get();
    if (!orderDoc.exists) return res.status(404).send('Order not found');
    
    const orderData = orderDoc.data();

    // 4. Защита от дублей (чтобы не отправить purchase дважды)
    if (orderData.ga_purchase_sent) {
       return res.status(200).send('Already processed');
    }

    // 5. Формируем Payload для sGTM
    const sgtmPayload = {
      event_name: 'purchase',
      client_id: orderData.ga_client_id,
      session_id: orderData.ga_session_id,
      transaction_id: order_id,
      value: amount,
      currency: 'KZT',
      items: orderData.items // Массив товаров по стандарту GA4 e-commerce
    };

    // 6. Отправляем в sGTM
    await fetch(SGTM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sgtmPayload)
    });

    // 7. Помечаем заказ, чтобы избежать дублей
    await db.collection('orders').doc(order_id).update({ ga_purchase_sent: true });

    res.status(200).send('Success');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Error');
  }
};
