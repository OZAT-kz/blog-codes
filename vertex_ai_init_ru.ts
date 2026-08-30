// ==============================================================================
// vertex_ai_init_ru.ts
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_init_ru.ts
// ==============================================================================


import { GoogleGenAI } from '@google/genai';

// Инициализация клиента Vertex AI.
// Так как код крутится в Cloud Run, учетные данные (ADC)
// и проект подтягиваются автоматически из среды окружения.
const ai = new GoogleGenAI();

export async function generateBotReply(userMessage: string, chatHistory: any[]) {
  // Формируем системный промпт (System Instruction), 
  // задающий персону и ограничения нашего ЦОН-бота
  const systemInstruction = `
Ты — официальный виртуальный ассистент Центров Обслуживания Населения (ЦОН) Казахстана.
Твоя цель — вежливо и точно консультировать граждан по вопросам получения госуслуг.
Правила:
1. Отвечай на том языке, на котором пишет пользователь. Если пользователь использует смешанный (шала-казахский), старайся отвечать на чистом казахском или русском, в зависимости от преобладающего языка.
2. Будь краток и эмпатичен. Никаких длинных простыней текста.
3. Никогда не запрашивай полный ИИН в целях безопасности, проси только последние 4 цифры для верификации, если это необходимо для вызова функции.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      ...chatHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.3, // Низкая температура для большей точности и предсказуемости
      maxOutputTokens: 500,
    }
  });

  return response.text;
}
