// ==============================================================================
// gpt_ads_integration.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gpt_ads_integration.js
// ==============================================================================


// Клиентский код в приложении/на сайте
// Полный пример интеграции GPT + React ищите на GitHub

async function initAds(userLat, userLon) {
  // 1. Быстро проверяем наш кэш пробок
  const trafficStatus = await checkTrafficJam(userLat, userLon); 
  
  window.googletag = window.googletag || {cmd: []};
  googletag.cmd.push(function() {
    var slot = googletag.defineSlot('/1234567/almaty_app_banner', [300, 250], 'div-gpt-ad-123')
      .addService(googletag.pubads());

    // 2. СЕКРЕТНЫЙ ИНГРЕДИЕНТ: Передаем контекст пробки в Ad Manager
    if (trafficStatus.isInJam) {
      slot.setTargeting('context', 'traffic_jam');
      slot.setTargeting('jam_severity', trafficStatus.severity); // e.g. '10_points'
    } else {
      slot.setTargeting('context', 'moving');
    }

    googletag.enableServices();
    googletag.display('div-gpt-ad-123');
  });
}
