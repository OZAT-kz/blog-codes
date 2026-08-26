// ==============================================================================
// cloud-function-webhook.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud-function-webhook.js
// ==============================================================================


// Google Cloud Functions (Node.js) үшін index.js
const fetch = require('node-fetch');
const { Firestore } = require('@google-cloud/firestore');
const db = new Firestore();

const SGTM_URL = 'https://sgtm.yourdomain.kz/kaspi-webhook'; // Сіздің Server-Side GTM URL-іңіз

exports.handleKaspiWebhook = async (req, res) => {
  try {
    // 1. Kaspi-ден келген вебхук қолтаңбасын тексереміз (Security First!)
    if (!verifyKaspiSignature(req)) {
      return res.status(403).send('Forbidden');
    }

    const { order_id, status, amount } = req.body;

    // 2. Тек сәтті төлемдерді ғана өңдейміз
    if (status !== 'PAID') {
      return res.status(200).send('OK');
    }

    // 3. Тапсырысты дерекқордан аламыз
    const orderDoc = await db.collection('orders').doc(order_id).get();
    if (!orderDoc.exists) return res.status(404).send('Order not found');
    
    const orderData = orderDoc.data();

    // 4. Қайталанудан қорғаныс (purchase екі рет кетіп қалмауы үшін)
    if (orderData.ga_purchase_sent) {
       return res.status(200).send('Already processed');
    }

    // 5. sGTM үшін Payload қалыптастырамыз
    const sgtmPayload = {
      event_name: 'purchase',
      client_id: orderData.ga_client_id,
      session_id: orderData.ga_session_id,
      transaction_id: order_id,
      value: amount,
      currency: 'KZT',
      items: orderData.items // GA4 e-commerce стандарты бойынша тауарлар массиві
    };

    // 6. sGTM-ге жібереміз
    await fetch(SGTM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sgtmPayload)
    });

    // 7. Қайталануларды болдырмау үшін тапсырысқа белгі қоямыз
    await db.collection('orders').doc(order_id).update({ ga_purchase_sent: true });

    res.status(200).send('Success');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal Error');
  }
};
