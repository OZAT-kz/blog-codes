// ==============================================================================
// Авторлық құқық пен DMCA бандарынан ЖИ-қалқан: Google Cloud Video Intelligence, Chromaprint және Gemini 2.5 Flash арқылы премодерация
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/dmca_shield_analyzer_kz.ts
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
  overallRiskScore: number;
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
Сен — Principal IP & Media Rights Technology Counsel, халықаралық авторлық құқық (DMCA, EU Copyright) және Content ID / Meta Rights Manager алгоритмдерінің сарапшысысың.
Медиа-активтің страйк алу, монетизациядан айырылу немесе бұғатталу қаупін бағала.

Бейне мән-мәтіні:
- Атауы: ${request.videoTitle}
- Коммерциялық контекст: ${request.isMonetizedCommercial}
- Транскрипция: "${request.transcript}"
- Табылған логотиптер: ${JSON.stringify(request.detectedLogos)}
- Аудио фингерпринт сәйкестіктері: ${JSON.stringify(request.audioFingerprintMatches)}

Талдау критерийлері:
1. Егер аудио белгілі трекпен 3.0 секундтан артық сәйкес келсе — бұл Content ID бойынша 99% триггер.
2. Егер кадрда бөтен бренд логотипі рұқсатсыз коммерциялық жарнамада тұрса — Trademark бұзу қаупі.
3. Fair Use қолдану мүмкіндігін бағала.
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        temperature: 0.1,
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
