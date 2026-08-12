// ==============================================================================
// Cloud Armor CEL rule for bot mitigation
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud-armor-bot-rule.js
// ==============================================================================

# CEL тіліндегі Cloud Armor кастомды ережесінің мысалы
request.headers['user-agent'].contains('HeadlessChrome') || 
(request.headers['accept-language'] == 'en-US,en;q=0.5' && request.path.matches('/api/v1/search'))
