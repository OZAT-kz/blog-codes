// ==============================================================================
// Market Inventory AI Auditor: Gemini 2.5 Flash OCR Webhook for AppSheet & Firestore
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/appsheet-gemini-inventory-ocr-webhook.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import { GoogleGenAI, Type } from '@google/genai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = express();
app.use(express.json({ limit: '15mb' }));

// Инициализация Google GenAI SDK (Vertex AI / Gemini API)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = getFirestore();

// Интерфейс распознанной позиции запчасти/товара
interface ParsedInventoryItem {
  oemArticle?: string;          // Артикул (например, 48820-42020 для стойки стабилизатора)
  partNameRu: string;           // Наименование (Тяга стабилизатора передняя)
  carBrandModel?: string;       // Применимость (Toyota RAV4 / Camry 50)
  quantity: number;             // Количество коробок/штук в партии
  priceKztPurchase?: number;    // Закупочная цена в тенге
  warehouseRowShelf: string;    // Ряд / стеллаж контейнера (Ряд 4, полка Б-2)
  condition: 'NEW_ORIGINAL' | 'AFTERMARKET_DUPLICATE' | 'USED_CONTRACT';
  confidenceScore: number;      // 0.0 - 1.0
}

/**
 * JSON Schema для строго типизированного ответа от Gemini 2.5 Flash
 */
const InventorySchema = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          oemArticle: { type: Type.STRING, description: 'OEM артикул детали, очищенный от дефисов и пробелов' },
          partNameRu: { type: Type.STRING, description: 'Название товара на русском/казахском языке' },
          carBrandModel: { type: Type.STRING, description: 'Марка и модель авто или тип одежды/товара' },
          quantity: { type: Type.INTEGER, description: 'Фактическое количество единиц' },
          priceKztPurchase: { type: Type.NUMBER, description: 'Закупочная цена (если видна на накладной)' },
          warehouseRowShelf: { type: Type.STRING, description: 'Локация в контейнере/складе' },
          condition: { 
            type: Type.STRING, 
            enum: ['NEW_ORIGINAL', 'AFTERMARKET_DUPLICATE', 'USED_CONTRACT'],
            description: 'Категория: Оригинал, Дубликат (Китай/Тайвань), Контрактная б/у'
          },
          confidenceScore: { type: Type.NUMBER, description: 'Оценка уверенности распознавания от 0 до 1' }
        },
        required: ['partNameRu', 'quantity', 'condition', 'confidenceScore']
      }
    },
    rawTextDetected: { type: Type.STRING, description: 'Сырой распознанный текст' },
    handwrittenNotes: { type: Type.STRING, description: 'Рукописные пометки кладовщика (напр: "брак", "Асхат алды")' }
  },
  required: ['items']
};

/**
 * Webhook для AppSheet: принимает base64 фото коробки запчасти или мятой накладной
 */
app.post('/api/v1/inventory/audit-photo', async (req: Request, res: Response) => {
  const { imageBase64, mimeType, containerId, operatorEmail } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  const systemInstruction = `Сен — Алматыдағы «Барахолка» (Байсат, Ялян, Кенжехан) мен «Car City» сауда орталығының автобөлшектер мен тауарларды лезде ревизиялайтын қатал әрі дәл сарапшысысың.
Міндетің:
1. Фотодағы майланған қораптан, штрихкодтан немесе қолмен жазылған накладнойдан OEM артикулды (Toyota, Hyundai, VAG), бөлшек атын, санын анықтау.
2. Қытайлық дубликат (SAT, Febest, CTR) пен түпнұсқа OEM-ді қатаң ажырату.
3. Қолжазба ескертпелерді («Асхатқа қарызға берілді», «2 шт брак») міндетті түрде бөлек шығару.`;

  try {
    const startTime = Date.now();

    // Мультимодальный инференс через Gemini 2.5 Flash с Structured Outputs
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: imageBase64,
                mimeType: mimeType || 'image/jpeg'
              }
            },
            {
              text: 'Распознай номенклатуру запчастей с фото коробки/накладной и верни структурированный JSON.'
            }
          ]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: InventorySchema,
        temperature: 0.1 // Детерминированный парсинг без галлюцинаций
      }
    });

    const latencyMs = Date.now() - startTime;
    const parsedData = JSON.parse(response.text || '{}');

    // Атомарное сохранение результатов ревизии в Firestore
    const batch = db.batch();
    const auditLogRef = db.collection('market_audits').doc();

    batch.set(auditLogRef, {
      containerId: containerId || 'CAR_CITY_4_TIER_BOX_112',
      auditor: operatorEmail || 'scout@ozat.kz',
      itemsCount: parsedData.items?.length || 0,
      items: parsedData.items || [],
      rawText: parsedData.rawTextDetected || '',
      notes: parsedData.handwrittenNotes || '',
      latencyMs,
      timestamp: FieldValue.serverTimestamp()
    });

    await batch.commit();

    return res.status(200).json({
      status: 'success',
      auditId: auditLogRef.id,
      latencyMs,
      items: parsedData.items,
      notes: parsedData.handwrittenNotes
    });
  } catch (error: any) {
    console.error('[Inventory OCR Error]:', error);
    return res.status(500).json({ error: 'OCR_PROCESSING_FAILED', details: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Inventory AI Auditor active on port ${PORT}`));
