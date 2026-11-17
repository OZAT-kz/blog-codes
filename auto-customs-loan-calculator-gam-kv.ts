/**
 * OZAT Engineering Hub — Production Reference Code
 * Article: Auto Import Calculator on Cloud Run & High-CPC Ad Manager Monetization
 * Repository: https://github.com/OZAT-kz/blog-codes
 * Author: Шарафутдинов Р.
 * Note: Reference implementation. Production deployments include rate-limiting, NBK FX API caching, and strict Zod schema validation.
 */

import express, { Request, Response } from 'express';

export interface CarImportInput {
  vehicleType: 'ice' | 'ev' | 'erev_series_hybrid';
  invoicePriceUsd: number;
  deliveryUsd: number;
  engineCc: number;
  manufactureYear: number;
  downPaymentKzt: number;
  loanTermMonths: 12 | 24 | 36 | 60 | 84;
}

export interface CustomsAndGamOutput {
  totalTurnkeyKzt: number;
  breakdownKzt: {
    customsValueKzt: number;
    customsDutyKzt: number;
    utilizationFeeKzt: number;
    vatKzt: number;
    sbktsAndEptsKzt: number;
    primaryRegistrationKzt: number;
  };
  estimatedMonthlyPaymentKzt: number;
  gamTargetingKeyValues: {
    iab_tier1: 'auto_finance';
    car_price_kzt_bucket: 'under_10m' | '10m_20m' | 'over_20m';
    credit_intent: 'cash' | 'auto_loan_high' | 'auto_loan_vip';
    vehicle_segment: 'ev_hybrid' | 'ice_sedan_suv';
  };
}

const MCI_2026_KZT = 3932; // МРП для детерминированного расчета сборов
const USD_KZT_RATE = 498.5;

export function calculateTurnkeyAndAdSignals(input: CarImportInput): CustomsAndGamOutput {
  const customsValueKzt = Math.round((input.invoicePriceUsd + input.deliveryUsd) * USD_KZT_RATE);

  // Пошлина ЕАЭС: 15% для ДВС и последовательных гибридов (EREV типа Li L7/L9), 0% по квоте для чистых EV
  const dutyRate = input.vehicleType === 'ev' ? 0.0 : 0.15;
  const customsDutyKzt = Math.round(customsValueKzt * dutyRate);

  // Коэффициент утильсбора (базовая ставка 50 МРП * коэффициент объема двигателя)
  const baseUtilFee = 50 * MCI_2026_KZT;
  let utilMultiplier = 1.0;
  if (input.vehicleType !== 'ev') {
    if (input.engineCc <= 1000) utilMultiplier = 1.5;
    else if (input.engineCc <= 2000) utilMultiplier = 3.5;
    else if (input.engineCc <= 3000) utilMultiplier = 5.0;
    else utilMultiplier = 11.5;
  }
  const utilizationFeeKzt = Math.round(baseUtilFee * utilMultiplier);

  // НДС 12% начисляется на сумму таможенной стоимости и пошлины
  const vatKzt = Math.round((customsValueKzt + customsDutyKzt) * 0.12);
  const sbktsAndEptsKzt = 245000;

  const ageYears = Math.max(0, 2026 - input.manufactureYear);
  const primaryRegMci = ageYears <= 2 ? 0.25 : ageYears <= 3 ? 50 : 500;
  const primaryRegistrationKzt = Math.round(primaryRegMci * MCI_2026_KZT);

  const totalTurnkeyKzt =
    customsValueKzt +
    customsDutyKzt +
    utilizationFeeKzt +
    vatKzt +
    sbktsAndEptsKzt +
    primaryRegistrationKzt;

  const loanPrincipalKzt = Math.max(0, totalTurnkeyKzt - input.downPaymentKzt);
  const monthlyRate = 0.215 / 12; // Средняя эффективная ставка автокредита в РК (21.5% годовых)
  const estimatedMonthlyPaymentKzt =
    loanPrincipalKzt > 0
      ? Math.round(
          (loanPrincipalKzt * (monthlyRate * Math.pow(1 + monthlyRate, input.loanTermMonths))) /
            (Math.pow(1 + monthlyRate, input.loanTermMonths) - 1)
        )
      : 0;

  const priceBucket =
    totalTurnkeyKzt < 10_000_000
      ? 'under_10m'
      : totalTurnkeyKzt <= 20_000_000
      ? '10m_20m'
      : 'over_20m';

  const creditIntent =
    loanPrincipalKzt === 0
      ? 'cash'
      : loanPrincipalKzt >= 12_000_000
      ? 'auto_loan_vip'
      : 'auto_loan_high';

  return {
    totalTurnkeyKzt,
    breakdownKzt: {
      customsValueKzt,
      customsDutyKzt,
      utilizationFeeKzt,
      vatKzt,
      sbktsAndEptsKzt,
      primaryRegistrationKzt,
    },
    estimatedMonthlyPaymentKzt,
    gamTargetingKeyValues: {
      iab_tier1: 'auto_finance',
      car_price_kzt_bucket: priceBucket,
      credit_intent: creditIntent,
      vehicle_segment: input.vehicleType === 'ice' ? 'ice_sedan_suv' : 'ev_hybrid',
    },
  };
}

const app = express();
app.use(express.json());

app.post('/api/v1/calculate-import', (req: Request, res: Response) => {
  const result = calculateTurnkeyAndAdSignals(req.body as CarImportInput);
  res.status(200).json(result);
});