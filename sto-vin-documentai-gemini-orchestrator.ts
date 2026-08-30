// ==============================================================================
// STO AI Auto Parts Matcher: Google Cloud Document AI + Gemini 2.5 Flash Vision Orchestrator
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/sto-vin-documentai-gemini-orchestrator.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { GoogleGenAI, Type } from '@google/genai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const app = express();
app.use(express.json({ limit: '20mb' }));

// Инициализация клиентов Google Cloud
const docAiClient = new DocumentProcessorServiceClient();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = getFirestore();

// Конфигурация процессора Document AI для распознавания техпаспорта (СРТС РК)
const DOCAI_PROCESSOR_NAME = process.env.DOCAI_PROCESSOR_NAME || 
  'projects/your-gcp-project/locations/eu/processors/kz-vehicle-id-processor';

interface AutoPartsMatchResult {
  vin: string;
  vehicle: {
    make: string;
    model: string;
    year: number;
    engineVolume: string;
  };
  detectedPart: {
    category: string;
    subsystem: 'ENGINE' | 'SUSPENSION' | 'BRAKES' | 'COOLING' | 'TRANSMISSION';
    visualDamage: string;
    estimatedOemNumber?: string;
  };
  recommendedMatches: Array<{
    oemCode: string;
    brand: string;
    titleRu: string;
    tier: 'ORIGINAL' | 'PREMIUM_AFTERMARKET' | 'BUDGET';
    priceKztAvg: number;
    inStockAlmaty: boolean;
  }>;
  confidenceScore: number;
}

/**
 * 1. Распознавание VIN и параметров авто из фото техпаспорта через Document AI
 */
async function parseVehicleRegistrationCertificate(imageBase64: string) {
  const request = {
    name: DOCAI_PROCESSOR_NAME,
    rawDocument: {
      content: imageBase64,
      mimeType: 'image/jpeg',
    },
  };

  const [result] = await docAiClient.processDocument(request);
  const { document } = result;

  // Извлечение сущностей (VIN, Год, Объем) из обработанного документа
  let vin = '';
  let makeModel = '';
  let year = new Date().getFullYear();

  if (document?.entities) {
    for (const entity of document.entities) {
      if (entity.type === 'VIN_NUMBER') vin = entity.mentionText?.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '') || '';
      if (entity.type === 'VEHICLE_MODEL') makeModel = entity.mentionText || '';
      if (entity.type === 'MANUFACTURE_YEAR') year = parseInt(entity.mentionText || '2015', 10);
    }
  }

  // Fallback: регулярное выражение поиска VIN (17 символов, исключая I, O, Q)
  if (!vin && document?.text) {
    const vinMatch = document.text.match(/[A-HJ-NPR-Z0-9]{17}/);
    if (vinMatch) vin = vinMatch[0];
  }

  return { vin, makeModel, year };
}

/**
 * 2. Анализ сломанной детали и подбор артикулов через Gemini 2.5 Flash Vision
 */
async function matchBrokenPartWithGemini(
  brokenPartBase64: string,
  vehicleInfo: { vin: string; makeModel: string; year: number }
): Promise<AutoPartsMatchResult> {
  const systemInstruction = `Сен — Алматы мен Астананың ең білікті СТО бас шебері әрі автобөлшектер каталогының (EPC, Microcat, ETKA) бас сарапшысысың.
Міндетің:
1. Көлік мәліметтерін (VIN: ${vehicleInfo.vin}, Модель: ${vehicleInfo.makeModel}, Жыл: ${vehicleInfo.year}) ескере отырып, фотодағы сынған немесе тозған бөлшекті (помпа, сайлентблок, суппорт, генератор релесі) 100% дәл анықтау.
2. Бөлшектің визуалды зақымын сипаттау және нақты OEM каталогының артикулын шығару.
3. Қазақстан нарығындағы (Car City, Phaeton, Барахолка) 3 баға деңгейін (Оригинал, Корея/Жапония дубликат, Эконом) ұсыну.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: brokenPartBase64,
              mimeType: 'image/jpeg'
            }
          },
          {
            text: `Автомобиль: ${vehicleInfo.makeModel} (${vehicleInfo.year} ж.), VIN: ${vehicleInfo.vin}.
Анықта: бұл қандай сынған бөлшек, оның OEM коды қандай және қандай дубликаттар сәйкес келеді?`
          }
        ]
      }
    ],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          detectedPart: {
            type: Type.OBJECT,
            properties: {
              category: { type: Type.STRING },
              subsystem: { type: Type.STRING, enum: ['ENGINE', 'SUSPENSION', 'BRAKES', 'COOLING', 'TRANSMISSION'] },
              visualDamage: { type: Type.STRING },
              estimatedOemNumber: { type: Type.STRING }
            },
            required: ['category', 'subsystem', 'visualDamage']
          },
          recommendedMatches: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                oemCode: { type: Type.STRING },
                brand: { type: Type.STRING },
                titleRu: { type: Type.STRING },
                tier: { type: Type.STRING, enum: ['ORIGINAL', 'PREMIUM_AFTERMARKET', 'BUDGET'] },
                priceKztAvg: { type: Type.NUMBER },
                inStockAlmaty: { type: Type.BOOLEAN }
              },
              required: ['oemCode', 'brand', 'titleRu', 'tier', 'priceKztAvg']
            }
          },
          confidenceScore: { type: Type.NUMBER }
        },
        required: ['detectedPart', 'recommendedMatches', 'confidenceScore']
      },
      temperature: 0.1
    }
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    vin: vehicleInfo.vin,
    vehicle: {
      make: vehicleInfo.makeModel.split(' ')[0] || 'Unknown',
      model: vehicleInfo.makeModel,
      year: vehicleInfo.year,
      engineVolume: '2.5L'
    },
    ...parsed
  };
}

/**
 * Главный эндпоинт для СТО: принимает 2 фото за один запрос
 */
app.post('/api/v1/sto/diagnose-and-match', async (req: Request, res: Response) => {
  const { techPassportBase64, brokenPartBase64, workshopId, mechanicName } = req.body;

  if (!techPassportBase64 || !brokenPartBase64) {
    return res.status(400).json({ error: 'Both techPassportBase64 and brokenPartBase64 are required' });
  }

  try {
    const t0 = Date.now();

    // Параллельное / последовательное выполнение Document AI и Gemini 2.5 Flash
    const vehicleInfo = await parseVehicleRegistrationCertificate(techPassportBase64);
    const matchResult = await matchBrokenPartWithGemini(brokenPartBase64, vehicleInfo);

    const totalLatencyMs = Date.now() - t0;

    // Логирование диагностики в Firestore
    const logRef = db.collection('sto_diagnostics').doc();
    await logRef.set({
      workshopId: workshopId || 'STO_SEIFULLINA_BOX_4',
      mechanic: mechanicName || 'Серик шебер',
      matchResult,
      totalLatencyMs,
      timestamp: FieldValue.serverTimestamp()
    });

    return res.status(200).json({
      status: 'success',
      diagnosticId: logRef.id,
      totalLatencyMs,
      data: matchResult
    });
  } catch (error: any) {
    console.error('[STO AI Matcher Error]:', error);
    return res.status(500).json({ error: 'MATCHING_PIPELINE_FAILED', message: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`STO AI Parts Matcher active on port ${PORT}`));
