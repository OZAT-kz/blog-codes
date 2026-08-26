// ==============================================================================
// vertex_ai_function_calling_ru.ts
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_function_calling_ru.ts
// ==============================================================================


import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI();

// Описываем инструмент (функцию), которую может вызывать Gemini
const bookAppointmentTool = {
  functionDeclarations: [
    {
      name: 'book_con_appointment',
      description: 'Бронирование очереди в ЦОН. Вызывай эту функцию, если пользователь просит забронировать очередь, записаться в ЦОН или взять талон.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          con_name: {
            type: Type.STRING,
            description: 'Название или район ЦОНа (например, "Алмалинский", "СпецЦОН Астана")'
          },
          date_time: {
            type: Type.STRING,
            description: 'Желаемая дата и время в формате ISO 8601 (например, "2026-08-15T10:00:00")'
          }
        },
        required: ['con_name', 'date_time'],
      },
    },
  ],
};

// Функция обработки диалога с поддержкой Tools
export async function handleUserMessageWithTools(userMessage: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      tools: [bookAppointmentTool], // Передаем наши инструменты модели
    }
  });

  // Проверяем, решила ли модель вызвать функцию
  if (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    if (call.name === 'book_con_appointment') {
      const args = call.args as any;
      console.log(`[System] Модель хочет забронировать очередь: ЦОН - ${args.con_name}, Время - ${args.date_time}`);
      
      // Здесь мы делаем реальный HTTP-запрос к API базы данных бронирования
      // const result = await api.book(args.con_name, args.date_time);
      
      // Возвращаем результат выполнения функции обратно в модель, 
      // чтобы она сформировала человечный ответ
      const functionResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: userMessage }] },
          // Добавляем запрос функции от модели в историю
          { role: 'model', parts: [{ functionCall: call }] }, 
          // Возвращаем результат выполнения
          { role: 'function', parts: [{ functionResponse: { name: call.name, response: { status: 'success', booking_id: 'A-123' } } }] }
        ]
      });
      return functionResponse.text;
    }
  }

  // Если функция не вызывалась, просто возвращаем текст ответа
  return response.text;
}
