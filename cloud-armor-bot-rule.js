// ==============================================================================
// cloud-armor-bot-rule.js
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud-armor-bot-rule.js
// ==============================================================================

# Пример кастомного правила Cloud Armor на CEL
request.headers['user-agent'].contains('HeadlessChrome') || 
(request.headers['accept-language'] == 'en-US,en;q=0.5' && request.path.matches('/api/v1/search'))
