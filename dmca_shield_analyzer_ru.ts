// ==============================================================================
// ИИ-щит от банов за авторские права и DMCA: премодерация медиа на Google Cloud Video Intelligence, Chromaprint и Gemini 2.5 Flash
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dmca_shield_analyzer_ru.ts
// ==============================================================================

import { GoogleGenAI, Type } from '@google/genai';

interface CopyrightAuditRequest {
  videoTitle: string;
  transcript: string;
  detectedLogos: Array<{ brand: string; startOffsetSec: number; endOffsetSec: number; confidence: number }>;
  audioFingerprintMatches: Array<{ trackName: string; artist: string; confidence: number; matchDurationSec: number }>;
  isMonetizedCommercial: boolean;
}

interface CopyrightSafetyReport {
  overallRiskScore: number; // 0.0 - 1.0
  riskLevel: 'LOW_RISK' | 'MEDIUM_WARNING' | 'CRITICAL_TAKEDOWN_RISK';
  contentIdStrikeProbability: number;
  dmcaActionRecommendations: string[];
  sanitizationRequired: boolean;
  audioSafeReplacementSuggestion: string;
}

export class DmcaShieldAnalyzer {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is required for DMCA compliance engine');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async auditMediaAsset(request: CopyrightAuditRequest): Promise<CopyrightSafetyReport> {
    const systemPrompt = `
Ты — Principal IP & Media Rights Technology Counsel, эксперт по международному копирайту (DMCA, EU Copyright Directive) и алгоритмам Content ID / Meta Rights Manager.
Оцени риски получения страйка, демонетизации или блокировки медиа-актива.

Контекст видео:
- Название: ${request.videoTitle}
- Коммерческий контекст (таргет/продажи): ${request.isMonetizedCommercial}
- Транскрипция: "${request.transcript}"
- Найденные логотипы: ${JSON.stringify(request.detectedLogos)}
- Совпадения аудио-фингерпринта: ${JSON.stringify(request.audioFingerprintMatches)}

Критерии анализа:
1. Если аудио совпадает с известным коммерческим треком дольше 3.0 секунд — это 99% триггер Content ID / Meta Rights Manager.
2. Если в кадре логотип стороннего бренда в коммерческой рекламе без разрешения — риск Trademark Infringement.
3. Оцени применимость Fair Use (добросовестное цитирование, критика или новостной факт).
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        temperature: 0.1, // Строгий детерминированный скоринг
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallRiskScore: { type: Type.NUMBER },
            riskLevel: { 
              type: Type.STRING, 
              enum: ['LOW_RISK', 'MEDIUM_WARNING', 'CRITICAL_TAKEDOWN_RISK'] 
            },
            contentIdStrikeProbability: { type: Type.NUMBER },
            dmcaActionRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            sanitizationRequired: { type: Type.BOOLEAN },
            audioSafeReplacementSuggestion: { type: Type.STRING }
          },
          required: [
            'overallRiskScore',
            'riskLevel',
            'contentIdStrikeProbability',
            'dmcaActionRecommendations',
            'sanitizationRequired',
            'audioSafeReplacementSuggestion'
          ]
        }
      }
    });

    const report: CopyrightSafetyReport = JSON.parse(response.text || '{}');
    return report;
  }
}
