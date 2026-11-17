/**
 * OZAT Engineering Hub — Production Reference Code
 * Article: SMB Ad Cost Reduction, Gemini 3.5 Flash-Lite Estimator & GAM Monetization
 * Repository: https://github.com/OZAT-kz/blog-codes
 * Author: Шарафутдинов Р.
 * Note: Reference implementation showing AI Policy Layer (LLM parameter extraction + deterministic price matrix).
 */

import { GoogleGenAI, Type } from '@google/genai';

export interface KitchenEstimateInput {
  userMessage: string;
  clientId: string;
}

export interface DeterministicQuoteResult {
  linearMeters: number;
  facadeMaterial: 'ldsp_egger' | 'mdf_agt' | 'mdf_enamel';
  hardwareTier: 'standard_boyard' | 'premium_blum';
  countertopType: 'hpl_postforming' | 'quartz_stone';
  totalPriceKzt: number;
  audienceSegment: 'budget_renovation' | 'mid_kitchen' | 'premium_interior';
  aiExplanationRu: string;
}

// Детерминированная матрица цен цеха (AI Policy Layer: ИИ не имеет права придумывать цены)
const BASE_METER_RATES_KZT: Record<DeterministicQuoteResult['facadeMaterial'], number> = {
  ldsp_egger: 185000,
  mdf_agt: 245000,
  mdf_enamel: 330000,
};

const HARDWARE_MULTIPLIER: Record<DeterministicQuoteResult['hardwareTier'], number> = {
  standard_boyard: 1.0,
  premium_blum: 1.28,
};

const COUNTERTOP_METER_KZT: Record<DeterministicQuoteResult['countertopType'], number> = {
  hpl_postforming: 32000,
  quartz_stone: 95000,
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function parseAndCalculateKitchenQuote(
  input: KitchenEstimateInput
): Promise<DeterministicQuoteResult> {
  // Шаг 1: gemini-3.5-flash-lite извлекает только структурированные параметры из свободного текста клиента
  const response = await ai.models.generateContent({
    model: 'gemini-3.5-flash-lite',
    contents: input.userMessage,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          linearMeters: { type: Type.NUMBER },
          facadeMaterial: {
            type: Type.STRING,
            enum: ['ldsp_egger', 'mdf_agt', 'mdf_enamel'],
          },
          hardwareTier: {
            type: Type.STRING,
            enum: ['standard_boyard', 'premium_blum'],
          },
          countertopType: {
            type: Type.STRING,
            enum: ['hpl_postforming', 'quartz_stone'],
          },
          shortAdviceRu: { type: Type.STRING },
        },
        required: [
          'linearMeters',
          'facadeMaterial',
          'hardwareTier',
          'countertopType',
          'shortAdviceRu',
        ],
      },
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  const meters = Math.min(Math.max(Number(parsed.linearMeters) || 3.2, 1.5), 12.0);
  const facade: DeterministicQuoteResult['facadeMaterial'] = parsed.facadeMaterial || 'mdf_agt';
  const hardware: DeterministicQuoteResult['hardwareTier'] = parsed.hardwareTier || 'premium_blum';
  const countertop: DeterministicQuoteResult['countertopType'] =
    parsed.countertopType || 'hpl_postforming';

  // Шаг 2: Строгий расчет стоимости на бэкенде без галлюцинаций LLM
  const corpusAndFacadeKzt =
    meters * BASE_METER_RATES_KZT[facade] * HARDWARE_MULTIPLIER[hardware];
  const countertopKzt = meters * COUNTERTOP_METER_KZT[countertop];
  const totalPriceKzt = Math.round(corpusAndFacadeKzt + countertopKzt);

  const audienceSegment: DeterministicQuoteResult['audienceSegment'] =
    totalPriceKzt >= 1_600_000
      ? 'premium_interior'
      : totalPriceKzt >= 950_000
      ? 'mid_kitchen'
      : 'budget_renovation';

  return {
    linearMeters: meters,
    facadeMaterial: facade,
    hardwareTier: hardware,
    countertopType: countertop,
    totalPriceKzt,
    audienceSegment,
    aiExplanationRu: parsed.shortAdviceRu,
  };
}