// ==============================================================================
// DDoS по-казахски и накрутка конкурентов: Как отбить атаку ботов через Google Cloud Armor и вычистить мусорный трафик из GA4
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud-armor-bot-rule.js
// ==============================================================================

# Пример кастомного правила Cloud Armor на CEL
request.headers['user-agent'].contains('HeadlessChrome') || 
(request.headers['accept-language'] == 'en-US,en;q=0.5' && request.path.matches('/api/v1/search'))
