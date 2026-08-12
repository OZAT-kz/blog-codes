// ==============================================================================
// React component for rendering an AdSense ad unit
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/react-ad-unit.js
// ==============================================================================


const AdUnit = ({ slotId }) => {
  useEffect(() => {
    // Скрипт жүктелгеннен кейін нақты блокты инициализациялау
    if (window.adsbygoogle && window.adsbygoogle.loaded) {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch (e) {
        console.error("AdSense Error:", e);
      }
    }
  }, []);

  return (
    &lt;div className="ad-container my-8"&gt;
      &lt;ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: '250px' }}
        data-ad-client="ca-pub-XXXXXXXXXXXXXXX"
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      /&gt;
    &lt;/div&gt;
  );
};
