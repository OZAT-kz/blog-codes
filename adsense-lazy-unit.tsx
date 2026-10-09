// ==============================================================================
// Теневой бан в Instagram: Перенос 60 000 подписчиков на PWA и монетизация в AdSense
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/adsense-lazy-unit.tsx
// ==============================================================================

import React, { useEffect, useRef, useState } from 'react';

interface AdSenseUnitProps {
  client: string;
  slot: string;
  format?: 'auto' | 'fluid' | 'rectangle';
  responsive?: boolean;
}

export const AdSenseLazyUnit: React.FC<AdSenseUnitProps> = ({
  client,
  slot,
  format = 'auto',
  responsive = true
}) => {
  const adRef = useRef<HTMLModElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const isLoaded = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !isLoaded.current) {
        setIsVisible(true);
        isLoaded.current = true;
        observer.disconnect();
      }
    }, { rootMargin: '250px 0px' });

    if (adRef.current) {
      observer.observe(adRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (isVisible && typeof window !== 'undefined') {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (err) {
        console.error('AdSense display error:', err);
      }
    }
  }, [isVisible]);

  return (
    <div className="my-8 text-center min-h-[120px] flex justify-center items-center overflow-hidden">
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block', minWidth: '300px' }}
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive={responsive ? 'true' : 'false'}
      />
    </div>
  );
};
