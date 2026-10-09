// ==============================================================================
// Анатомия AdTech-арбитража в Алматы: как инфлюенсерам выжать максимальный CPC (до 450 ₸ за клик), стравив Google Ad Manager и РСЯ через Prebid.js на Google Cloud
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/prebid_gam_auction_engine.ts
// ==============================================================================

interface PrebidAdUnit {
  code: string;
  mediaTypes: {
    banner: {
      sizes: number[][];
    };
  };
  bids: Array<{
    bidder: string;
    params: Record<string, unknown>;
  }>;
}

declare global {
  interface Window {
    pbjs: {
      que: Array<() => void>;
      addAdUnits: (units: PrebidAdUnit[]) => void;
      requestBids: (options: {
        timeout: number;
        bidsBackHandler: () => void;
      }) => void;
      setTargetingForGPTAsync: () => void;
    };
    googletag: {
      cmd: Array<() => void>;
      defineSlot: (path: string, sizes: number[][], divId: string) => any;
      pubads: () => any;
      enableServices: () => void;
      display: (divId: string) => void;
    };
  }
}

export function initHeaderBiddingAuction(slotId: string, adUnitPath: string): void {
  window.pbjs = window.pbjs || { que: [] };
  window.googletag = window.googletag || { cmd: [] };

  const PREBID_TIMEOUT_MS = 650;

  const adUnits: PrebidAdUnit[] = [
    {
      code: slotId,
      mediaTypes: {
        banner: {
          sizes: [[300, 250], [336, 280], [300, 600]]
        }
      },
      bids: [
        {
          bidder: 'yandex',
          params: {
            pageId: 1984210,
            impId: 1,
            currency: 'KZT'
          }
        },
        {
          bidder: 'rubicon',
          params: {
            accountId: '18492',
            siteId: '394812',
            zoneId: '2109482'
          }
        }
      ]
    }
  ];

  window.pbjs.que.push(() => {
    window.pbjs.addAdUnits(adUnits);
    window.pbjs.requestBids({
      timeout: PREBID_TIMEOUT_MS,
      bidsBackHandler: () => {
        window.googletag.cmd.push(() => {
          window.pbjs.setTargetingForGPTAsync();
          window.googletag.pubads().refresh();
        });
      }
    });
  });

  window.googletag.cmd.push(() => {
    window.googletag
      .defineSlot(adUnitPath, [[300, 250], [336, 280]], slotId)
      .addService(window.googletag.pubads());

    window.googletag.pubads().enableSingleRequest();
    window.googletag.pubads().collapseEmptyDivs();
    window.googletag.pubads().setCentering(true);
    window.googletag.enableServices();
  });
}
