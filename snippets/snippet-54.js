// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// Хук для ленивой загрузки скрипта AdSense
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
      script.dataset.adClient = 'ca-pub-XXXXXXXXXXXXXXX'; // Ваш ID
      
      document.head.appendChild(script);
      setAdLoaded(true);
      
      // Отписываемся от событий, чтобы не грузить скрипт дважды
      window.removeEventListener('scroll', loadAds);
      window.removeEventListener('mousemove', loadAds);
      window.removeEventListener('touchstart', loadAds);
    };

    // Слушаем первые взаимодействия пользователя
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
