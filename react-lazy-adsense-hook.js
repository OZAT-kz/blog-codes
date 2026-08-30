// ==============================================================================
// react-lazy-adsense-hook.js
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/react-lazy-adsense-hook.js
// ==============================================================================


// AdSense скриптін жалқау жүктеуге арналған хук
import { useEffect, useState } from 'react';

const useLazyAdSense = () => {
  const [adLoaded, setAdLoaded] = useState(false);

  useEffect(() => {
    const loadAds = () => {
      if (adLoaded) return;
      
      const script = document.createElement('script');
      script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js';
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.adClient = 'ca-pub-XXXXXXXXXXXXXXX'; // Сіздің ID
      
      document.head.appendChild(script);
      setAdLoaded(true);
      
      // Скриптті екі рет жүктемеу үшін оқиғалардан бас тартамыз
      window.removeEventListener('scroll', loadAds);
      window.removeEventListener('mousemove', loadAds);
      window.removeEventListener('touchstart', loadAds);
    };

    // Пайдаланушының алғашқы әрекеттерін тыңдаймыз
    window.addEventListener('scroll', loadAds, { once: true, passive: true });
    window.addEventListener('mousemove', loadAds, { once: true, passive: true });
    window.addEventListener('touchstart', loadAds, { once: true, passive: true });

    return () => {
      window.removeEventListener('scroll', loadAds);
      window.removeEventListener('mousemove', loadAds);
      window.removeEventListener('touchstart', loadAds);
    };
  }, [adLoaded]);

  return adLoaded;
};
