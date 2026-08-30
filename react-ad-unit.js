// ==============================================================================
// AdSense убивает ваш Core Web Vitals? Как мы ускорили загрузку рекламы в 3 раза, перенеся SSR на Google Cloud Run
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/react-ad-unit.js
// ==============================================================================

const AdUnit = ({ slotId }) => {
  useEffect(() => {
    // Инициализация конкретного блока после загрузки скрипта
    if (window.adsbygoogle && window.adsbygoogle.loaded) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense Error:", e);
      }
    }
  }, []);

  return (
    <div className="ad-container my-8">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: '250px' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXX"
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
};
