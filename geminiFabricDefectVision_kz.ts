// ==============================================================================
// Gemini 2.5 Flash Fabric Vision Detection (KZ)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/geminiFabricDefectVision_kz.ts
// ==============================================================================

import { GoogleGenAI, Type, Schema } from '@google/genai';

// Google GenAI SDK инициализациясы (Серверлік контур)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * Мата ақауларын анықтауға арналған жауап сұлбасы
 */
const FabricDefectResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    scanTimestamp: { type: Type.STRING, description: 'Талдаудың ISO 8601 уақыт белгісі' },
    rollId: { type: Type.STRING, description: 'Мата орамының (рулон) идентификаторы' },
    fabricType: { type: Type.STRING, description: 'Мата түрі (мысалы, 3 жіпті футер)' },
    overallQualityGrade: { 
      type: Type.STRING, 
      enum: ['GRADE_A', 'GRADE_B', 'GRADE_REJECT'],
      description: 'Матаның қорытынды сапа грейді'
    },
    defectsCount: { type: Type.INTEGER, description: 'Табылған ақаулардың жалпы саны' },
    defects: {
      type: Type.ARRAY,
      description: 'Матаның локализацияланған аномалиялар тізімі',
      items: {
        type: Type.OBJECT,
        properties: {
          defectId: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            enum: ['OIL_STAIN', 'WEAVING_KNOT', 'LADDER_RUN', 'WEFT_SKEW_ANGLE', 'COLOR_STREAK', 'HOLE'],
            description: 'Мата ақауының түрі'
          },
          confidenceScore: { type: Type.NUMBER, description: 'Модель сенімділігі 0.0 бастап 1.0 дейін' },
          severity: { type: Type.STRING, enum: ['CRITICAL', 'MAJOR', 'MINOR'] },
          box2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: '0..1000 шкаласындағы нормализацияланған бокс координаталары [ymin, xmin, ymax, xmax]'
          },
          exclusionZoneMarginMm: { 
            type: Type.INTEGER, 
            description: 'Лазерлік проекция үшін ақау айналасындағы оқшаулау аймағының қашықтығы (мм)'
          },
          description: { type: Type.STRING, description: 'Ақау сипатының қысқаша сипаттамасы' }
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
 * Пішу үстеліндегі матаны талдау үшін Gemini 2.5 Flash шақыру
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
            text: `Тігін цехының жоғары дәлдіктегі оптикалық инспекторы рөліндесің.
Үстелге жайылған матаның 4K суретін талда (Рулон ID: ${metadata.rollId}, түсі: ${metadata.expectedColor}, тығыздығы: ${metadata.gsmWeight} г/м²).
Барлық тоқыма түйіндерін, май дақтарын, жіп тартылуларын, көлденең жіптердің қисаюын және тесіктерді анықта.
Әрбір ақау үшін 0..1000 шкаласында [ymin, xmin, ymax, xmax] 2D bounding box координаталарын бер және лазерлік жүйе үшін Exclusion Zone қашықтығын есепте.`
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
  console.log(`[Gemini 2.5 Flash Vision] Инспекция ${latencyMs} мс ішінде аяқталды. Рулон: ${metadata.rollId}`);

  if (!response.text) {
    throw new Error('Gemini API мата ақауларын талдауда бос жауап қайтарды');
  }

  return JSON.parse(response.text) as DefectScanResult;
}
