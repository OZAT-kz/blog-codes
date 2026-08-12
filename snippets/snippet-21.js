// ==============================================================================
// Provided by OZAT (https://github.com/OZAT-kz)
// ==============================================================================

// _ga кукиінен client_id шығарып алу функциясы
function getGAClientId() {
  const match = document.cookie.match(/(?:^|;)\s*_ga=([^;]*)/);
  if (match) {
    // Куки мынадай болады: GA1.1.123456789.1600000000
    // Бізге соңғы екі бөлігі қажет
    const parts = match[1].split('.');
    return parts.length === 4 ? `${parts[2]}.${parts[3]}` : null;
  }
  return null;
}

// Тапсырысты бэкендке жібереміз
async function createOrder(cartItems) {
  const payload = {
    items: cartItems,
    ga_client_id: getGAClientId(),
    ga_session_id: sessionStorage.getItem('ga_session_id') // Немесе gtag('get', ...) ішінен аламыз
  };
  
  await api.post('/orders', payload);
}
