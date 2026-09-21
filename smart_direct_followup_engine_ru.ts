// ==============================================================================
// Умный Direct-дожим без попадания в спам-фильтры Meta: нейросетевой скоринг готовности на Gemini 2.5 Flash и Cloud Tasks
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/smart_direct_followup_engine_ru.ts
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
Ты — Principal AI Sales Engineer и эксперт по поведенческой психологии клиентов в казахстанском e-commerce.
Проанализируй историю диалога в Instagram Direct между клиентом и локальным бизнесом (Алматы/Астана).

Контекст продуктов/услуг:
${productCatalogContext}

История диалога:
${JSON.stringify(history, null, 2)}

Твоя задача:
1. Оценить готовность к покупке (leadScore от 0.0 до 1.0).
2. Определить, безопасно ли делать мягкое касание (shouldFollowUp). Если клиент явно отказался, выразил агрессию или сказал "нет" — shouldFollowUp = false.
3. Если shouldFollowUp = true, сформулировать деликатный, ультра-нативный, персонализированный вопрос или полезный факт (на русском и казахском языках).
СТРОГО ЗАПРЕЩЕНО: фразы "вы подумали?", "напоминаю", "акция сгорает", "вам актуально?". Касание должно нести практическую ценность или задавать легкий закрытый вопрос о деталях выбора.
`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        temperature: 0.2, // Минимизируем галлюцинации для строгого скоринга
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
