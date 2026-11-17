/**
 * OZAT Engineering Hub — Production Reference Code
 * Article: Auto Import Calculator on Cloud Run & High-CPC Ad Manager Monetization
 * Repository: https://github.com/OZAT-kz/blog-codes
 * Author: Шарафутдинов Р.
 * Note: Reference implementation for Prebid.js + Google Publisher Tag (GPT) dynamic Key-Value targeting and CLS guard.
 */

export interface GamTargetingPayload {
  iab_tier1: string;
  car_price_kzt_bucket: string;
  credit_intent: string;
  vehicle_segment: string;
}

declare global {
  interface Window {
    googletag: any;
    pbjs: any;
    yaContextCb: Array<() => void>;
    Ya: any;
  }
}

export function refreshHighCpcAutoFinanceSlot(
  adUnitPath: string,
  domSlotId: string,
  targeting: GamTargetingPayload
): void {
  window.googletag = window.googletag || { cmd: [] };
  window.pbjs = window.pbjs || { que: [] };

  const container = document.getElementById(domSlotId);
  if (container) {
    // Защита от бана AdSense за Accidental Clicks (CLS = 0):
    // Жесткая фиксация минимальной высоты и безопасного отступа 150px от кнопки расчета
    container.style.minHeight = '280px';
    container.style.marginTop = '150px';
  }

  window.pbjs.que.push(() => {
    window.pbjs.requestBids({
      timeout: 1100,
      adUnitCodes: [domSlotId],
      bidsBackHandler: () => {
        window.googletag.cmd.push(() => {
          const pubads = window.googletag.pubads();

          // Передача кастомных Key-Values в Google Ad Manager для банков и КАСКО
          Object.entries(targeting).forEach(([key, value]) => {
            pubads.setTargeting(key, String(value));
          });

          window.pbjs.setTargetingForGPTAsync([domSlotId]);
          const slots = pubads
            .getSlots()
            .filter((s: any) => s.getSlotElementId() === domSlotId);

          if (slots.length > 0) {
            pubads.refresh(slots);
          } else {
            const newSlot = window.googletag
              .defineSlot(adUnitPath, [[336, 280], [300, 250]], domSlotId)
              .addService(pubads);
            window.googletag.display(domSlotId);
            pubads.refresh([newSlot]);
          }
        });
      },
    });
  });
}