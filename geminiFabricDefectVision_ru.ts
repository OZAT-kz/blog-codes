// ==============================================================================
// Gemini 2.5 Flash Fabric Vision Detection (RU)
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/geminiFabricDefectVision_ru.ts
// ==============================================================================

import { GoogleGenAI, Type, Schema } from '@google/genai';

// Инициализация Google GenAI SDK (Серверный контур)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Описание схемы ответа для обнаружения дефектов ткани
 */
const FabricDefectResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    scanTimestamp: { type: Type.STRING, description: 'ISO 8601 временная метка анализа' },
    rollId: { type: Type.STRING, description: 'Идентификатор рулона полотна' },
    fabricType: { type: Type.STRING, description: 'Тип ткани (например, 3-х ниточный футер)' },
    overallQualityGrade: { 
      type: Type.STRING, 
      enum: ['GRADE_A', 'GRADE_B', 'GRADE_REJECT'],
      description: 'Итоговый грейд полотна'
    },
    defectsCount: { type: Type.INTEGER, description: 'Общее количество найденных дефектов' },
    defects: {
      type: Type.ARRAY,
      description: 'Список локализованных аномалий полотна',
      items: {
        type: Type.OBJECT,
        properties: {
          defectId: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            enum: ['OIL_STAIN', 'WEAVING_KNOT', 'LADDER_RUN', 'WEFT_SKEW_ANGLE', 'COLOR_STREAK', 'HOLE'],
            description: 'Тип дефекта ткани'
          },
          confidenceScore: { type: Type.NUMBER, description: 'Уверенность модели от 0.0 до 1.0' },
          severity: { type: Type.STRING, enum: ['CRITICAL', 'MAJOR', 'MINOR'] },
          box2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: 'Нормализованные координаты бокса [ymin, xmin, ymax, xmax] в масштабе 0..1000'
          },
          exclusionZoneMarginMm: { 
            type: Type.INTEGER, 
            description: 'Рекомендуемый отступ зоны отчуждения в мм вокруг дефекта для лазера'
          },
          description: { type: Type.STRING, description: 'Краткое описание характера дефекта' }
        },
        required: ['defectId', 'category', 'confidenceScore', 'severity', 'box2d', 'exclusionZoneMarginMm']
      }
    }
  },
  required: ['scanTimestamp', 'rollId', 'overallQualityGrade', 'defectsCount', 'defects']
};

export interface DefectScanResult {
  scanTimestamp: string;
  rollId: string;
  fabricType: string;
  overallQualityGrade: 'GRADE_A' | 'GRADE_B' | 'GRADE_REJECT';
  defectsCount: number;
  defects: Array<{
    defectId: string;
    category: 'OIL_STAIN' | 'WEAVING_KNOT' | 'LADDER_RUN' | 'WEFT_SKEW_ANGLE' | 'COLOR_STREAK' | 'HOLE';
    confidenceScore: number;
    severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
    box2d: [number, number, number, number];
    exclusionZoneMarginMm: number;
    description?: string;
  }>;
}

/**
 * Вызов Gemini 2.5 Flash для инспекции полотна на раскройном столе
 */
export async function analyzeFabricSurface(
  gcsImageUri: string, 
  metadata: { rollId: string; expectedColor: string; gsmWeight: number }
): Promise<DefectScanResult> {
  const startTime = Date.now();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: gcsImageUri,
              mimeType: 'image/jpeg'
            }
          },
          {
            text: `Выступаешь в роли высокоточного оптического инспектора швейного раскройного цеха.
Проанализируй 4K-снимок поверхности разложенного на столе рулона ткани (ID: ${metadata.rollId}, ожидаемый цвет: ${metadata.expectedColor}, плотность: ${metadata.gsmWeight} г/м²).
Найди все ткацкие узлы, масляные пятна от оверлоков, стрелки, перекос утка и дыры.
Для каждого дефекта укажи точные 2D bounding box координаты [ymin, xmin, ymax, xmax] в шкале 0..1000 и рассчитай технологический отступ Exclusion Zone в миллиметрах для системы проекции лекал.`
          }
        ]
      }
    ],
    config: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: FabricDefectResponseSchema
    }
  });

  const latencyMs = Date.now() - startTime;
  console.log(`[Gemini 2.5 Flash Vision] Инспекция завершена за ${latencyMs} мс. Рулон: ${metadata.rollId}`);

  if (!response.text) {
    throw new Error('Gemini API вернул пустой ответ при анализе дефектов ткани');
  }

  return JSON.parse(response.text) as DefectScanResult;
}
