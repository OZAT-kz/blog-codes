// ==============================================================================
// vertex_ai_function_calling_kz.ts
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_function_calling_kz.ts
// ==============================================================================


import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI();

// Gemini шақыра алатын құралды (функцияны) сипаттаймыз
const bookAppointmentTool = {
  functionDeclarations: [
    {
      name: 'book_con_appointment',
      description: 'ХҚКО-да кезек брондау. Пайдаланушы кезек брондауды, ХҚКО-ға жазылуды немесе талон алуды сұраса, осы функцияны шақыр.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          con_name: {
            type: Type.STRING,
            description: 'ХҚКО атауы немесе ауданы (мысалы, "Алмалы", "Астана Мамандандырылған ХҚКО")'
          },
          date_time: {
            type: Type.STRING,
            description: 'ISO 8601 форматындағы қалаулы күн мен уақыт (мысалы, "2026-08-15T10:00:00")'
          }
        },
        required: ['con_name', 'date_time'],
      },
    },
  ],
};

// Tools қолдауы бар диалогты өңдеу функциясы
export async function handleUserMessageWithTools(userMessage: string) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    config: {
      tools: [bookAppointmentTool], // Модельге құралдарымызды береміз
    }
  });

  // Модельдің функцияны шақыруға шешім қабылдағанын тексереміз
  if (response.functionCalls && response.functionCalls.length > 0) {
    const call = response.functionCalls[0];
    if (call.name === 'book_con_appointment') {
      const args = call.args as any;
      console.log(`[System] Модель кезек брондағысы келеді: ХҚКО - ${args.con_name}, Уақыты - ${args.date_time}`);
      
      // Мұнда біз брондау дерекқорының API-іне нақты HTTP-сұрау жасаймыз
      // const result = await api.book(args.con_name, args.date_time);
      
      // Адамға түсінікті жауап құрастыру үшін функцияның орындалу нәтижесін
      // кері модельге қайтарамыз
      const functionResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: userMessage }] },
          // Модельден функция сұрауын тарихқа қосамыз
          { role: 'model', parts: [{ functionCall: call }] }, 
          // Орындалу нәтижесін қайтарамыз
          { role: 'function', parts: [{ functionResponse: { name: call.name, response: { status: 'success', booking_id: 'A-123' } } }] }
        ]
      });
      return functionResponse.text;
    }
  }

  // Егер функция шақырылмаса, жай ғана жауап мәтінін қайтарамыз
  return response.text;
}
