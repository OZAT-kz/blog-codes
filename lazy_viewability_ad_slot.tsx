// ==============================================================================
// Казахстанский E-E-A-T: как локальный фудблогер/ресторанный гид вышел на первое место в Google без ссылочных бирж и монетизировал 50 000 читателей через Ad Manager
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/lazy_viewability_ad_slot.tsx
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';

interface LazyAdSlotProps {
  slotPath: string;
  divId: string;
  dimensions: number[][];
  minDwellSeconds?: number;
}

export const LazyViewabilityAdSlot: React.FC<LazyAdSlotProps> = ({
  slotPath,
  divId,
  dimensions,
  minDwellSeconds = 30
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [adLoaded, setAdLoaded] = useState<boolean>(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let refreshTimer: NodeJS.Timeout | null = null;
    let observer: IntersectionObserver | null = null;

    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !adLoaded) {
            setAdLoaded(true);
            if (typeof window !== 'undefined' && (window as any).googletag) {
              const googletag = (window as any).googletag;
              googletag.cmd.push(() => {
                const slot = googletag
                  .defineSlot(slotPath, dimensions, divId)
                  .addService(googletag.pubads());
                googletag.display(divId);

                // Auto-refresh только при условии удержания видимости > 30 секунд
                refreshTimer = setTimeout(() => {
                  if (entry.intersectionRatio >= 0.5) {
                    googletag.pubads().refresh([slot]);
                  }
                }, minDwellSeconds * 1000);
              });
            }
          }
        });
      },
      { threshold: 0.5, rootMargin: '100px 0px' }
    );

    observer.observe(containerRef.current);

    return () => {
      if (observer) observer.disconnect();
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [slotPath, divId, dimensions, adLoaded, minDwellSeconds]);

  return (
    <div
      ref={containerRef}
      className="my-8 mx-auto flex flex-col items-center justify-center bg-neutral-100 dark:bg-neutral-900/50 rounded-xl p-2 border border-neutral-200 dark:border-neutral-800 min-h-[250px]"
      style={{ minWidth: dimensions[0]?.[0] || 300, minHeight: dimensions[0]?.[1] || 250 }}
    >
      <span className="text-[10px] text-neutral-400 uppercase tracking-wider mb-1">Реклама</span>
      <div id={divId} />
    </div>
  );
};
