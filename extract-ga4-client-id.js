// ==============================================================================
// Почему GA4 врет на 30% при оплате через Kaspi? Чиним атрибуцию транзакций с помощью Server-Side GTM и Cloud Functions
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/extract-ga4-client-id.js
// ==============================================================================

// Функция для извлечения client_id из куки _ga
function getGAClientId() {
  const match = document.cookie.match(/(?:^|;)s*_ga=([^;]*)/);
  if (match) {
    // Кука выглядит так: GA1.1.123456789.1600000000
    // Нам нужны последние две части
    const parts = match[1].split('.');
    return parts.length === 4 ? `${parts[2]}.${parts[3]}` : null;
  }
  return null;
}

// Отправляем заказ на бэкенд
async function createOrder(cartItems) {
  const payload = {
    items: cartItems,
    ga_client_id: getGAClientId(),
    ga_session_id: sessionStorage.getItem('ga_session_id') // Или достаем из gtag('get', ...)
  };
  
  await api.post('/orders', payload);
}
