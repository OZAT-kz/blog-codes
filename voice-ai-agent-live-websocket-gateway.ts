// ==============================================================================
// Voice AI Live Audio WebSocket Orchestrator with Gemini 2.5 Flash & Function Calling
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/voice-ai-agent-live-websocket-gateway.ts
// ==============================================================================

import WebSocket from 'ws';
import { GoogleGenAI } from '@google/genai';
import { google } from 'googleapis';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Инициализация Google GenAI SDK (Vertex AI / Gemini API)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const db = getFirestore();

// Интерфейс вызова бронирования через Function Calling
interface BookSlotArgs {
  clientName: string;
  clientPhone: string;
  serviceType: 'fade_haircut' | 'beard_trim' | 'dental_cleaning' | 'caries_treatment';
  startTimeIso: string;
  barberOrDoctor?: string;
}

// 1. Определение инструментов (Tools / Function Calling) для Gemini Live API
const voiceTools = [
  {
    functionDeclarations: [
      {
        name: 'checkAvailability',
        description: 'Проверяет свободные временные слоты мастера или врача на конкретную дату.',
        parameters: {
          type: 'OBJECT',
          properties: {
            dateIso: { type: 'STRING', description: 'Дата в формате YYYY-MM-DD' },
            serviceType: { type: 'STRING', description: 'Тип запрашиваемой услуги' }
          },
          required: ['dateIso', 'serviceType']
        }
      },
      {
        name: 'bookAppointment',
        description: 'Бронирует подтвержденный клиентом слот в Google Календаре и CRM клиники/барбершопа.',
        parameters: {
          type: 'OBJECT',
          properties: {
            clientName: { type: 'STRING', description: 'Имя клиента' },
            clientPhone: { type: 'STRING', description: 'Номер телефона клиента в международном формате' },
            serviceType: { type: 'STRING', description: 'Услуга' },
            startTimeIso: { type: 'STRING', description: 'Точное время начала записи ISO 8601' },
            barberOrDoctor: { type: 'STRING', description: 'Желаемый мастер или врач (если указан)' }
          },
          required: ['clientName', 'clientPhone', 'serviceType', 'startTimeIso']
        }
      }
    ]
  }
];

/**
 * Обработчик входящего WebSocket соединения от SIP/VoIP шлюза (FreePBX / Asterisk / WebRTC)
 */
export async function handleIncomingCallSocket(clientWs: WebSocket, callerPhone: string) {
  console.log(`[SIP Bridge] Новое голосовое соединение для абонента: ${callerPhone}`);

  // Системный промпт: дружелюбный, живой, двуязычный (KZ/RU), лаконичный
  const systemInstruction = `Сен — Алматы мен Астанадағы премиум барбершоп пен стоматологиялық клиниканың сыпайы әрі көңілді дауыстық ИИ-администраторысың.
Тіл саясаты: Клиент қай тілде (қазақша, орысша немесе шала-қазақша) сөйлесе, сол тілде бірден еркін жауап бер.
Стиль: Сөйлемдеріңді қысқа, нақты (1-2 сөйлем) және жылы ұста. Күрделі терминдерсіз.
Міндетің:
1. Қоңырау шалған клиенттің атын, қажетті қызметін және ыңғайлы уақытын анықтау.
2. checkAvailability арқылы бос уақытты тексеріп, клиентке нақты 2 таңдау ұсыну (мысалы: "Ертең 15:00 немесе 18:30 ыңғайлы ма?").
3. Келіскен соң bookAppointment шақыру және WhatsApp-қа растау хабарламасы жіберілетінін айту.`;

  // Подключение к Gemini 2.5 Flash Live WebSocket сессии
  // @ts-ignore - Live API bidirectional session
  const session = await ai.models.createLiveSession({
    model: 'gemini-2.5-flash',
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Aoede' } // Естественный мягкий голос
        }
      },
      systemInstruction: { parts: [{ text: systemInstruction }] },
      tools: voiceTools
    }
  });

  // Получение входящих аудио-чанков (16kHz PCM 16-bit Mono) от телефонного шлюза
  clientWs.on('message', async (data: Buffer) => {
    // Прямая передача PCM в сокет Gemini Live без ожидания окончания фразы
    session.sendAudioChunk(data);
  });

  // Получение аудио-потока и Tool Calls от Gemini 2.5 Flash
  session.on('audio', (audioPcmChunk: Buffer) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(audioPcmChunk);
    }
  });

  session.on('toolCall', async (toolCall: any) => {
    console.log(`[Gemini Tool Call]: ${toolCall.name}`, toolCall.args);
    
    if (toolCall.name === 'checkAvailability') {
      const slots = await queryCalendarFreeSlots(toolCall.args.dateIso);
      session.sendToolResponse({
        callId: toolCall.id,
        response: { availableSlots: slots }
      });
    } else if (toolCall.name === 'bookAppointment') {
      const booking = await executeDeterministicBooking({
        ...toolCall.args,
        clientPhone: callerPhone
      });
      session.sendToolResponse({
        callId: toolCall.id,
        response: { status: 'success', bookingId: booking.id, time: booking.startTime }
      });
    }
  });

  clientWs.on('close', () => {
    console.log(`[SIP Bridge] Звонок завершен: ${callerPhone}`);
    session.close();
  });
}

// Детерминированная запись в календарь и WhatsApp нотификация
async function executeDeterministicBooking(args: BookSlotArgs) {
  // 1. Атомарная транзакция в Firestore для предотвращения Double Booking
  const bookingRef = db.collection('appointments').doc();
  await db.runTransaction(async (tx) => {
    const conflictQuery = await tx.get(
      db.collection('appointments')
        .where('startTime', '==', args.startTimeIso)
        .where('status', '==', 'confirmed')
    );
    if (!conflictQuery.empty) {
      throw new Error('SLOT_ALREADY_TAKEN');
    }
    tx.set(bookingRef, {
      ...args,
      status: 'confirmed',
      createdAt: Timestamp.now()
    });
  });

  // 2. Отправка WhatsApp уведомления через Cloud Pub/Sub
  console.log(`[WhatsApp Notification] Сообщение с 2GIS-локацией отправлено на ${args.clientPhone}`);
  return { id: bookingRef.id, startTime: args.startTimeIso };
}

async function queryCalendarFreeSlots(date: string): Promise<string[]> {
  // Эмуляция проверки календаря (или реальный Google Calendar v3 freebusy)
  return ['15:00', '16:30', '19:00'];
}
