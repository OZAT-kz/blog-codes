// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================
# Пример кастомного правила Cloud Armor на CEL
request.headers['user-agent'].contains('HeadlessChrome') || 
(request.headers['accept-language'] == 'en-US,en;q=0.5' && request.path.matches('/api/v1/search'))
