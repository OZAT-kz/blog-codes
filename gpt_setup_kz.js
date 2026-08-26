// ==============================================================================
// gpt_setup_kz.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gpt_setup_kz.js
// ==============================================================================

// Custom таргетингі бар Google Publisher Tag (GPT) инициализациясы
window.googletag = window.googletag || {cmd: []};

googletag.cmd.push(function() {
  // Жарнама слотын анықтаймыз (мысалы, шапкадағы Billboard 970x250)
  var adSlot = googletag.defineSlot('/1234567/ozat_premium_billboard', [[970, 250], [728, 90]], 'div-gpt-ad-1234567-0')
      .addService(googletag.pubads());

  // DataLayer-ден пайдаланушы деректерін оқимыз (GA4-пен синхрондалған)
  // Нақты жобада бұл жалауша сіздің CDP-ден немесе Google Audience API арқылы келуі мүмкін
  var userSegment = window.dataLayerTracker && window.dataLayerTracker.isPredictiveBuyer ? 'high_value' : 'standard';
  var userInterests = window.dataLayerTracker ? window.dataLayerTracker.categoryAffinities : [];

  // Key-Values таргетингін слот деңгейіне береміз
  adSlot.setTargeting('audience_value', userSegment);
  
  if (userInterests.length > 0) {
    adSlot.setTargeting('interests', userInterests);
  }

  // PubAds Service баптауы
  googletag.pubads().enableSingleRequest();
  googletag.pubads().collapseEmptyDivs();
  
  // Зиянды креативтерден қорғау үшін қауіпсіз фреймді қосамыз
  googletag.pubads().setSafeFrameConfig({ sandbox: true });

  googletag.enableServices();
});