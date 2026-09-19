// ==============================================================================
// Блогерлерге арналған AdSense-монетизация: қорлайтын бартерден Cloud Run және Next.js арқылы валюталық табысқа
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/adsense_zero_cls_slot_component_kz.tsx
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';

interface AdSenseSlotProps {
  client: string;
  slot: string;
  format?: 'auto' | 'fluid' | 'rectangle';
  responsive?: boolean;
  minHeight?: number;
}

export const ZeroClsAdSlot: React.FC<AdSenseSlotProps> = ({
  client,
  slot,
  format = 'auto',
  responsive = true,
  minHeight = 280
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    // Жалқау жүктеу үшін IntersectionObserver қолданамыз
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px 0px' } // Экранға дейін 200px қалғанда алдын ала жүктейміз
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isIntersecting) return;

    try {
      const win = window as any;
      win.adsbygoogle = win.adsbygoogle || [];
      win.adsbygoogle.push({});
      setAdLoaded(true);
    } catch (err) {
      console.warn('AdSense initialization suppressed:', err);
    }
  }, [isIntersecting]);

  return (
    <div
      ref={containerRef}
      className="ad-container-wrapper my-6 w-full flex justify-center items-center overflow-hidden bg-gray-50/50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-800"
      style={{ minHeight: `${minHeight}px` }}
    >
      {isIntersecting ? (
        <ins
          className="adsbygoogle"
          style={{ display: 'block', minHeight: `${minHeight}px`, width: '100%' }}
          data-ad-client={client}
          data-ad-slot={slot}
          data-ad-format={format}
          data-full-width-responsive={responsive ? 'true' : 'false'}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center p-4">
          <div className="w-3/4 h-4 bg-gray-200 dark:bg-gray-800 rounded animate-pulse mb-3" />
          <div className="w-1/2 h-3 bg-gray-200 dark:bg-gray-800 rounded animate-pulse" />
        </div>
      )}
    </div>
  );
};
