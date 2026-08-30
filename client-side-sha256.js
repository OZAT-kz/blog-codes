// ==============================================================================
// O2O (Offline-to-Online) аналитика: Как связать клики из Google Ads с реальными визитами в точки продаж в Алматы через BigQuery
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/client-side-sha256.js
// ==============================================================================

async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);                    
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// При успешной авторизации
const rawPhone = '+77011234567'; // Телефон из формы
sha256(rawPhone).then(hashedPhone => {
    gtag('config', 'G-XXXXXXX', {
      'user_id': hashedPhone // Теперь это анонимный хэш
    });
    gtag('event', 'login', { method: 'phone' });
});
