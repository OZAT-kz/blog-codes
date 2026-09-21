// ==============================================================================
// Монетизация вирусных Reels через AdSense (Арбитраж без «серых» схем)
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/safe_viral_ad_unit_ru.tsx
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';

interface SafeAdUnitProps {
  slotId: string;
  format?: 'auto' | 'rectangle' | 'horizontal';
  minHeightPx: number;
}

export const SafeViralAdUnit: React.FC<SafeAdUnitProps> = ({
  slotId,
  format = 'auto',
  minHeightPx
}) => {
  const adContainerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [clickCount, setClickCount] = useState(0);
  const [isBlockedForSpam, setIsBlockedForSpam] = useState(false);

  useEffect(() => {
    // Детекция подозрительного клик-шторма для предотвращения бана AdSense
    const clickThreshold = 3;
    const windowMs = 60000;
    const clicksKey = `ad_clicks_${slotId}`;
    
    const stored = JSON.parse(sessionStorage.getItem(clicksKey) || '[]');
    const recentClicks = stored.filter((ts: number) => Date.now() - ts < windowMs);
    
    if (recentClicks.length >= clickThreshold) {
      setIsBlockedForSpam(true);
      return;
    }

    // Lazy Loading через IntersectionObserver
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !isLoaded && !isBlockedForSpam) {
            try {
              // Безопасный вызов AdSense push
              ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
              setIsLoaded(true);
            } catch (err) {
              console.error('AdSense injection error:', err);
            }
            observer.disconnect();
          }
        });
      },
      { rootMargin: '250px 0px' } // Предзагрузка за 250px до экрана
    );

    if (adContainerRef.current) {
      observer.observe(adContainerRef.current);
    }

    return () => observer.disconnect();
  }, [slotId, isLoaded, isBlockedForSpam]);

  if (isBlockedForSpam) {
    return null; // Скрываем блок при аномалиях кликов
  }

  return (
    <div
      ref={adContainerRef}
      className="my-8 mx-auto w-full max-w-[728px] overflow-hidden rounded-xl bg-neutral-100 dark:bg-neutral-800/40 p-2 flex flex-col items-center justify-center border border-neutral-200 dark:border-neutral-700/50"
      style={{ minHeight: `${minHeightPx}px` }}
    >
      <span className="text-[10px] uppercase tracking-wider text-neutral-400 mb-1">
        Реклама от партнеров Google
      </span>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: `${minHeightPx - 24}px`, width: '100%' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXX"
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};
