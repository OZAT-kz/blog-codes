// ==============================================================================
// Instagram Direct Shopping on Gemini 2.5 Flash + Kaspi Pay Webhook
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/instagram-direct-gemini-gateway.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { CloudTasksClient } from '@google-cloud/tasks';

const app = express();

// Instagram Webhook требует raw body для проверки криптографической подписи HMAC-SHA256
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = getFirestore();
const tasksClient = new CloudTasksClient();

const INSTAGRAM_APP_SECRET = process.env.INSTAGRAM_APP_SECRET || '';
const INSTAGRAM_PAGE_ACCESS_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN || '';
const KASPI_PAY_API_KEY = process.env.KASPI_PAY_API_KEY || '';
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'ozat-cloud';
const QUEUE_LOCATION = 'europe-west1';
const QUEUE_NAME = 'instagram-followups';

// 1. Проверка подписи входящего вебхука от Meta Graph API
function verifyMetaSignature(req: any): boolean {
  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', INSTAGRAM_APP_SECRET);
  const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}

// 2. Верификация Webhook URL для Instagram Graph API
app.get('/webhook/instagram', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_VERIFY_TOKEN) {
    console.log('[Meta Webhook] Webhook verified successfully');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// 3. Обработка входящих сообщений Direct и комментариев под Reels
app.post('/webhook/instagram', async (req: any, res: Response) => {
  if (!verifyMetaSignature(req)) {
    console.error('[Meta Webhook] Signature verification failed!');
    return res.status(401).send('Invalid signature');
  }

  // Мгновенный 200 OK для Meta API, чтобы избежать повторных retry (таймаут Meta = 5 секунд)
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;
  if (body.object !== 'instagram') return;

  for (const entry of body.entry) {
    for (const messagingEvent of entry.messaging || []) {
      const senderId = messagingEvent.sender.id;
      const messageText = messagingEvent.message?.text;
      const quickReplyPayload = messagingEvent.message?.quick_reply?.payload;

      if (!messageText && !quickReplyPayload) continue;

      const userQuery = quickReplyPayload || messageText;
      console.log(`[Direct Inbound] From: ${senderId} | Query: "${userQuery}"`);

      try {
        await handleDirectConversation(senderId, userQuery);
      } catch (err) {
        console.error(`[Error handling Direct message from ${senderId}]:`, err);
      }
    }
  }
});

// 4. Диспетчер диалога с вызовом Gemini 2.5 Flash Function Calling
async function handleDirectConversation(senderId: string, userQuery: string) {
  // Извлекаем историю сообщений из Firestore
  const sessionRef = db.collection('instagram_sessions').doc(senderId);
  const sessionSnap = await sessionRef.get();
  const sessionData = sessionSnap.data() || { history: [], state: 'ACTIVE' };

  // Описание инструментов (Function Calling) для Gemini 2.5 Flash
  const searchInventoryTool = {
    name: 'searchInventory',
    description: 'Поиск товаров в каталоге шоурума по названию, цвету, размеру или категории',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Ключевые слова (например, "платье шелк", "оверсайз худи", "пиджак")' },
        size: { type: Type.STRING, description: 'Размер: XS, S, M, L, XL, 42, 44, 46, OneSize' },
        color: { type: Type.STRING, description: 'Желаемый цвет (бежевый, черный, изумрудный)' }
      },
      required: ['query']
    }
  };

  const createKaspiPaymentLinkTool = {
    name: 'createKaspiPaymentLink',
    description: 'Создание ссылки на оплату через Kaspi Pay и бронирование товара на 60 минут',
    parameters: {
      type: Type.OBJECT,
      properties: {
        sku: { type: Type.STRING, description: 'Артикул товара' },
        size: { type: Type.STRING, description: 'Выбранный размер' },
        deliveryType: { type: Type.STRING, enum: ['ALMATY_YANDEX_COURIER', 'ASTANA_EXPRESS', 'REGIONS_KAZPOST', 'PICKUP_SHOWROOM'], description: 'Способ доставки' },
        customerPhone: { type: Type.STRING, description: 'Номер телефона клиента для Kaspi перевода / счета' },
        deliveryAddress: { type: Type.STRING, description: 'Адрес доставки в Алматы/Астане' }
      },
      required: ['sku', 'size', 'deliveryType']
    }
  };

  // Вызов Gemini 2.5 Flash
  const model = 'gemini-2.5-flash';
  const systemInstruction = `Ты — вежливый, стильный и ультра-быстрый AI-консультант казахстанского инстаграм-шоурума "Aura Store" в Алматы.
Твоя цель: моментально помочь клиенту с размером, наличием и сформировать прямую ссылку на оплату Kaspi Pay без дурацкого "ответили в дайрект".

ПРАВИЛА ОБЩЕНИЯ:
1. Понимай казахский, русский и шала-казахский язык ("мына көйлек бар ма?", "цена қанша?", "на 44 размер қандай келеді?").
2. Отвечай на том же языке, на котором обратился клиент.
3. Говори живо, как топовый стилист, кратко, без воды (максимум 2-3 предложения на сообщение в Direct).
4. Если клиент спрашивает цену — НАЗЫВАЙ ЦЕНУ СРАЗУ и предлагай оформить бронь в 1 клик через Kaspi.
5. При оформлении заказа используй инструмент createKaspiPaymentLink.
`;

  const response = await ai.models.generateContent({
    model,
    contents: [
      ...sessionData.history,
      { role: 'user', parts: [{ text: userQuery }] }
    ],
    config: {
      systemInstruction,
      temperature: 0.3,
      tools: [{ functionDeclarations: [searchInventoryTool, createKaspiPaymentLinkTool] }]
    }
  });

  const functionCalls = response.functionCalls();
  let botReplyText = '';

  if (functionCalls && functionCalls.length > 0) {
    const call = functionCalls[0];
    if (call.name === 'searchInventory') {
      const args = call.args as any;
      const items = await queryInventoryFromFirestore(args.query, args.size, args.color);
      
      const functionResponse = await ai.models.generateContent({
        model,
        contents: [
          ...sessionData.history,
          { role: 'user', parts: [{ text: userQuery }] },
          { role: 'model', parts: [{ functionCall: call }] },
          { role: 'user', parts: [{ functionResponse: { name: 'searchInventory', response: { items } } }] }
        ],
        config: { systemInstruction }
      });
      botReplyText = functionResponse.text || 'У нас в наличии отличные варианты!';
    } else if (call.name === 'createKaspiPaymentLink') {
      const args = call.args as any;
      const order = await generateKaspiPayment(senderId, args);
      
      botReplyText = `🎉 Отлично! Забронировали для вас ${order.title} (${args.size}).
💳 Сумма: ${order.amount.toLocaleString('ru-KZ')} ₸
🔗 Ссылка на мгновенную оплату Kaspi: ${order.paymentUrl}
⏳ Бронь действует 60 минут. После оплаты курьер Яндекс Доставки выедет по вашему адресу!`;

      // Ставим Cloud Tasks на автоматический follow-up через 45 минут
      await scheduleAbandonedCartFollowup(senderId, order.orderId, 45 * 60);
    }
  } else {
    botReplyText = response.text || 'Сәлеметсіз бе! Чем могу помочь?';
  }

  // Отправляем ответ в Direct через Meta Graph API
  await sendInstagramDirectMessage(senderId, botReplyText);

  // Сохраняем историю
  await sessionRef.set({
    history: [
      ...sessionData.history.slice(-8),
      { role: 'user', parts: [{ text: userQuery }] },
      { role: 'model', parts: [{ text: botReplyText }] }
    ],
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
}

// 5. Вспомогательный запрос в каталог Firestore
async function queryInventoryFromFirestore(query: string, size?: string, color?: string) {
  const snapshot = await db.collection('products')
    .where('inStock', '==', true)
    .limit(3)
    .get();

  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      sku: doc.id,
      title: data.titleRu,
      priceKzt: data.priceKzt,
      sizesAvailable: data.sizes || ['S', 'M'],
      colors: data.colors || ['бежевый', 'черный']
    };
  });
}

// 6. Генерация ссылки Kaspi Pay
async function generateKaspiPayment(senderId: string, args: any) {
  const orderId = `AURA-${Date.now().toString().slice(-6)}`;
  const amount = 24900; // Динамически из базы
  
  // В продакшене: запрос к API Kaspi Pay B2B Gateway
  const paymentUrl = `https://kaspi.kz/pay/AuraShowroom?order=${orderId}&amount=${amount}`;
  
  await db.collection('orders').doc(orderId).set({
    orderId,
    instagramUserId: senderId,
    sku: args.sku,
    size: args.size,
    amount,
    status: 'PENDING_PAYMENT',
    deliveryType: args.deliveryType,
    address: args.deliveryAddress || 'Уточняется в чате',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });

  return { orderId, title: 'Шелковое платье миди', amount, paymentUrl };
}

// 7. Планировщик Cloud Tasks для Follow-up напоминания
async function scheduleAbandonedCartFollowup(senderId: string, orderId: string, delayInSeconds: number) {
  const parent = tasksClient.queuePath(PROJECT_ID, QUEUE_LOCATION, QUEUE_NAME);
  const url = `https://api.ozat.kz/api/instagram/followup`;

  const task = {
    httpRequest: {
      httpMethod: 'POST' as const,
      url,
      headers: { 'Content-Type': 'application/json' },
      body: Buffer.from(JSON.stringify({ senderId, orderId })).toString('base64'),
      oidcToken: {
        serviceAccountEmail: `tasks-invoker@${PROJECT_ID}.iam.gserviceaccount.com`
      }
    },
    scheduleTime: {
      seconds: Math.floor(Date.now() / 1000) + delayInSeconds
    }
  };

  await tasksClient.createTask({ parent, task });
  console.log(`[Cloud Tasks] Scheduled follow-up for order ${orderId} in ${delayInSeconds}s`);
}

// 8. Отправка сообщения в Instagram Graph API
async function sendInstagramDirectMessage(recipientId: string, text: string) {
  const url = `https://graph.facebook.com/v19.0/me/messages?access_token=${INSTAGRAM_PAGE_ACCESS_TOKEN}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text }
    })
  });
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Instagram Gemini Gateway listening on port ${PORT}`));
