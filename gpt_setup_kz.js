// ==============================================================================
// Қазақстанда AdSense тиын әкеле ме? GA4 Predictive Audiences-ті Google Ad Manager-ге беріп, RPM-ді қалай 3 есе өсірдік
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gpt_setup_kz.js
// ==============================================================================

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
