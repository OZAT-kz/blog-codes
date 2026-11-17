/**
 * OZAT Engineering Hub — Production Reference Code
 * Article: SMB Ad Cost Reduction, Gemini 3.5 Flash-Lite Estimator & GAM Monetization
 * Repository: https://github.com/OZAT-kz/blog-codes
 * Author: Шарафутдинов Р.
 * Note: Reference implementation for Google Publisher Tag (GPT) category exclusions and GA4 high-intent audience signals.
 */

export interface RenovationAdContext {
  articleTopic: 'quartz_vs_hpl' | 'blum_hinges_guide' | 'kitchen_layout_almaty';
  estimatedBudgetBucket: 'under_1m' | '1m_2m' | 'over_2m';
  needInstallmentOrLoan: boolean;
}

declare global {
  interface Window {
    googletag: any;
    dataLayer: Array<Record<string, unknown>>;
  }
}

export function mountNonCompetingSmbAdSlot(
  slotElementId: string,
  adUnitPath: string,
  context: RenovationAdContext
): void {
  window.googletag = window.googletag || { cmd: [] };
  window.dataLayer = window.dataLayer || [];

  const slotEl = document.getElementById(slotElementId);
  if (slotEl) {
    // Фиксируем высоту контейнера для нулевого сдвига макета (CLS = 0)
    slotEl.style.minHeight = '280px';
    slotEl.style.margin = '32px 0';
  }

  window.googletag.cmd.push(() => {
    const pubads = window.googletag.pubads();

    // Сигналы для смежных дорогих рекламодателей (Банки: кредит на ремонт, Встраиваемая техника, ЖК)
    pubads.setTargeting('smb_vertical', 'home_renovation_finance');
    pubads.setTargeting('renovation_budget', context.estimatedBudgetBucket);
    pubads.setTargeting(
      'loan_intent',
      context.needInstallmentOrLoan ? 'mortgage_renovation_loan' : 'appliances_premium'
    );

    // Активация метки исключения прямых мебельщиков-конкурентов в Google Ad Manager
    pubads.setCategoryExclusion('competing_custom_furniture_kz');

    const slot = window.googletag
      .defineSlot(adUnitPath, [[336, 280], [300, 250]], slotElementId)
      .addService(pubads);

    window.googletag.enableServices();
    window.googletag.display(slotElementId);
  });

  // Отправка чистого сигнала в GA4 / Google Ads только для вовлеченных пользователей
  window.dataLayer.push({
    event: 'smb_high_intent_engaged',
    renovation_budget: context.estimatedBudgetBucket,
    loan_intent: context.needInstallmentOrLoan,
  });
}