// ==============================================================================
// Meta спам-сүзгілеріне түспейтін ақылды Direct-дожим: Gemini 2.5 Flash және Cloud Tasks арқылы нейрожелілік бағалау
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/smart_direct_followup_engine_kz.ts
// ==============================================================================

import { GoogleGenAI, Type } from '@google/genai';

interface ChatMessage {
  sender: 'user' | 'business';
  text: string;
  timestamp: string;
}

interface FollowUpDecision {
  shouldFollowUp: boolean;
  leadScore: number;
  reason: string;
  suggestedMessageRu: string;
  suggestedMessageKz: string;
  preferredDelayMinutes: number;
}

export class SmartDirectFollowUpEngine {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is mandatory for intent scoring');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async evaluateLeadAndCraftHook(
    history: ChatMessage[],
    productCatalogContext: string
  ): Promise<FollowUpDecision> {
    const prompt = `
Сен — Principal AI Sales Engineer және қазақстандық e-commerce саласындағы сатып алушылар психологиясының сарапшысысың.
Instagram Direct-тегі тұтынушы мен жергілікті бизнес (Алматы/Астана) арасындағы диалог тарихын талда.

Өнімдер контексті:
${productCatalogContext}

Диалог тарихы:
${JSON.stringify(history, null, 2)}

Міндетің:
1. Сатып алуға дайындықты бағалау (leadScore 0.0-ден 1.0-ге дейін).
2. Қайта жазудың қауіпсіз екенін анықтау (shouldFollowUp). Егер тұтынушы нақты бас тартса немесе қарсылық білдірсе — shouldFollowUp = false.
3. Егер shouldFollowUp = true болса, пайдалы факті немесе детальді сұрайтын нәзік сұрақ құрастыру (қазақ және орыс тілдерінде).
ҚАТАҢ ТЫЙЫМ САЛЫНАДЫ: "ойландыңыз ба?", "есіңізге саламыз", "акция бітеді" деген тіркестер.
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            shouldFollowUp: { type: Type.BOOLEAN },
            leadScore: { type: Type.NUMBER },
            reason: { type: Type.STRING },
            suggestedMessageRu: { type: Type.STRING },
            suggestedMessageKz: { type: Type.STRING },
            preferredDelayMinutes: { type: Type.INTEGER }
          },
          required: [
            'shouldFollowUp',
            'leadScore',
            'reason',
            'suggestedMessageRu',
            'suggestedMessageKz',
            'preferredDelayMinutes'
          ]
        }
      }
    });

    const parsed: FollowUpDecision = JSON.parse(response.text || '{}');
    return parsed;
  }
}
