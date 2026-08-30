// ==============================================================================
// Қалдықсыз пішу: Алматыдағы 12 тігіншісі бар шеберхана Gemini 2.5 Flash (Vision) және Cloud Storage арқылы матадан 800 000 ₸ қалай үнемдейді
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/geminiFabricDefectVision_kz.ts
// ==============================================================================

import { GoogleGenAI, Type, Schema } from '@google/genai';

// Инициализация Google GenAI SDK (Google Cloud Vertex AI / Gemini API)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Схема структурированного ответа для детекции тканевых дефектов
const FabricDefectResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    rollId: { type: Type.STRING, description: "Идентификатор рулона ткани" },
    fabricType: { type: Type.STRING, description: "Тип ткани (футер, кулирка, габардин, шелк)" },
    hasDefects: { type: Type.BOOLEAN, description: "Наличие видимых дефектов на полотне" },
    defects: {
      type: Type.ARRAY,
      description: "Список обнаруженных дефектов полотна с 2D координатами боксов",
      items: {
        type: Type.OBJECT,
        properties: {
          defectType: {
            type: Type.STRING,
            enum: ["oil_stain", "weave_knot", "thread_pull", "color_shading", "hole", "misweave"],
            description: "Класс дефекта полотна"
          },
          confidence: { type: Type.NUMBER, description: "Уверенность детекции (0.0 - 1.0)" },
          severity: { type: Type.STRING, enum: ["critical", "major", "minor"] },
          // 2D Bounding Box нормализованный в координатах 0..1000 [ymin, xmin, ymax, xmax]
          box2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "Координаты [ymin, xmin, ymax, xmax] в масштабе 1000x1000"
          },
          recommendedExclusionMarginMm: {
            type: Type.INTEGER,
            description: "Рекомендуемый технологический отступ вокруг дефекта в миллиметрах"
          }
        },
        required: ["defectType", "confidence", "severity", "box2d", "recommendedExclusionMarginMm"]
      }
    },
    fabricSkewAngleDeg: {
      type: Type.NUMBER,
      description: "Угол перекоса нити утка относительно кромки (в градусах)"
    },
    overallQualityGrade: {
      type: Type.STRING,
      enum: ["Grade_A", "Grade_B", "Grade_C_Reject"]
    }
  },
  required: ["rollId", "hasDefects", "defects", "fabricSkewAngleDeg", "overallQualityGrade"]
};

export interface DefectScanResult {
  rollId: string;
  hasDefects: boolean;
  defects: Array<{
    defectType: string;
    confidence: number;
    severity: 'critical' | 'major' | 'minor';
    box2d: [number, number, number, number];
    recommendedExclusionMarginMm: number;
  }>;
  fabricSkewAngleDeg: number;
  overallQualityGrade: string;
}

/**
 * Анализ 4K-снимка полотна раскройного стола через Gemini 2.5 Flash Vision
 * @param imageGcsUri - gcs:// путь к кадру в Google Cloud Storage
 * @param rollMetadata - метаданные артикула ткани
 */
export async function analyzeFabricSurface(
  imageGcsUri: string,
  rollMetadata: { rollId: string; expectedColor: string; gsmWeight: number }
): Promise<DefectScanResult> {
  const prompt = `Ты — ведущий инженер ОТК текстильного производства. 
Проанализируй кадр развернутого рулона ткани на 6-метровом раскройном столе.
Артикул: ${rollMetadata.rollId}, эталонный цвет: ${rollMetadata.expectedColor}, плотность: ${rollMetadata.gsmWeight} г/м2.
Задачи:
1. Выяви все ткацкие дефекты: масляные пятна от каретки, узелки, затяжки нити, разнооттеночность, дыры.
2. Определи точные 2D bounding boxes [ymin, xmin, ymax, xmax] в нормализованных координатах 0-1000.
3. Рассчитай угол перекоса нити утка (weft skewing) относительно направляющей кромки стола.
4. Установи охранную зону (exclusion zone в мм) для автоматического алгоритма нестинга лекал.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { fileData: { fileUri: imageGcsUri, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      }
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: FabricDefectResponseSchema,
      temperature: 0.1, // Минимальная температура для детерминированной точности
      thinkingConfig: { thinkingBudget: 0 } // Flash режим с ультранизкой латентностью (<350мс)
    }
  });

  const parsed: DefectScanResult = JSON.parse(response.text || '{}');
  return parsed;
}
