// ==============================================================================
// gpt_setup_ru.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gpt_setup_ru.js
// ==============================================================================

// Инициализация Google Publisher Tag (GPT) с кастомным таргетингом
window.googletag = window.googletag || {cmd: []};

googletag.cmd.push(function() {
  // Определяем рекламный слот (например, Billboard 970x250 в шапке)
  var adSlot = googletag.defineSlot('/1234567/ozat_premium_billboard', [[970, 250], [728, 90]], 'div-gpt-ad-1234567-0')
      .addService(googletag.pubads());

  // Читаем данные пользователя из нашего DataLayer (синхронизированного с GA4)
  // В реальном проекте этот флаг может приходить из вашего CDP или через Google Audience API
  var userSegment = window.dataLayerTracker && window.dataLayerTracker.isPredictiveBuyer ? 'high_value' : 'standard';
  var userInterests = window.dataLayerTracker ? window.dataLayerTracker.categoryAffinities : [];

  // Передаем Key-Values таргетинг на уровень слота
  adSlot.setTargeting('audience_value', userSegment);
  
  if (userInterests.length > 0) {
    adSlot.setTargeting('interests', userInterests);
  }

  // Настройка PubAds Service
  googletag.pubads().enableSingleRequest();
  googletag.pubads().collapseEmptyDivs();
  
  // Включаем безопасный фрейм для защиты от вредоносных креативов
  googletag.pubads().setSafeFrameConfig({ sandbox: true });

  googletag.enableServices();
});