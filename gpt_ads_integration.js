// ==============================================================================
// gpt_ads_integration.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gpt_ads_integration.js
// ==============================================================================


// Қосымшадағы/сайттағы клиенттік код
// GPT + React интеграциясының толық мысалын GitHub-тан іздеңіз

async function initAds(userLat, userLon) {
  // 1. Біздің кептеліс кэшімізді жылдам тексереміз
  const trafficStatus = await checkTrafficJam(userLat, userLon); 
  
  window.googletag = window.googletag || {cmd: []};
  googletag.cmd.push(function() {
    var slot = googletag.defineSlot('/1234567/almaty_app_banner', [300, 250], 'div-gpt-ad-123')
      .addService(googletag.pubads());

    // 2. ҚҰПИЯ ИНГРЕДИЕНТ: Кептеліс контекстін Ad Manager-ге береміз
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
