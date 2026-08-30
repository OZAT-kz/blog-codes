// ==============================================================================
// Instant WhatsApp & 2GIS Confirmation Dispatcher Hook for Night AI Bookings
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/whatsapp-2gis-booking-confirmation-hook.ts
// ==============================================================================

import axios from 'axios';

interface FollowUpPayload {
  clientPhone: string;
  clientName: string;
  businessName: string;
  serviceTitle: string;
  bookingTime: string;
  map2GisUrl: string;
  address: string;
  language: 'kz' | 'ru';
}

/**
 * Мгновенный follow-up в WhatsApp через 5 секунд после завершения ночного звонка
 */
export async function sendInstantWhatsAppConfirmation(payload: FollowUpPayload) {
  const isKz = payload.language === 'kz';
  
  const textMessage = isKz
    ? `Сәлеметсіз бе, ${payload.clientName}! 💈\nСіз ${payload.businessName} салонына сәтті жазылдыңыз.\n\n📅 Уақыты: ${payload.bookingTime}\n✂️ Қызмет: ${payload.serviceTitle}\n📍 Мекенжайы: ${payload.address}\n🗺 2GIS маршруты: ${payload.map2GisUrl}\n\nЕгер жоспарыңыз өзгерсе, осы чатқа жауап беріңіз. Күтеміз!`
    : `Здравствуйте, ${payload.clientName}! 💈\nВы успешно записаны в ${payload.businessName}.\n\n📅 Время: ${payload.bookingTime}\n✂️ Услуга: ${payload.serviceTitle}\n📍 Адрес: ${payload.address}\n🗺 Маршрут в 2GIS: ${payload.map2GisUrl}\n\nЕсли ваши планы изменятся, просто напишите в этот чат. Ждем вас!`;

  const waGatewayUrl = process.env.WHATSAPP_GATEWAY_URL || 'https://api.whatsapp.com/v1/messages';

  try {
    await axios.post(
      waGatewayUrl,
      {
        to: payload.clientPhone.replace(/[^0-9]/g, ''),
        type: 'text',
        text: { body: textMessage }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 5000
      }
    );
    console.log(`[WhatsApp Follow-up] Успешно отправлено клиенту ${payload.clientPhone}`);
  } catch (error: any) {
    console.error('[WhatsApp Follow-up Error]', error?.response?.data || error.message);
  }
}
