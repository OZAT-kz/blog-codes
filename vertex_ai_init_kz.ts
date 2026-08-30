// ==============================================================================
// «Сен кімсің?»: Vertex AI-ды WhatsApp-қа қалай қосып, ХҚКО-ботын шала қазақша түсінуге қалай үйреттік
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/vertex_ai_init_kz.ts
// ==============================================================================

import { GoogleGenAI } from '@google/genai';

// Vertex AI клиентін инициализациялау.
// Код Cloud Run ішінде айналып тұрғандықтан, тіркеу деректері (ADC)
// және жоба қоршаған ортадан автоматты түрде тартылады.
const ai = new GoogleGenAI();

export async function generateBotReply(userMessage: string, chatHistory: any[]) {
  // ХҚКО-ботымыздың персонатұрпаты мен шектеулерін
  // орнататын жүйелік промпт (System Instruction) құрастырамыз
  const systemInstruction = `
Сен — Қазақстанның Халыққа қызмет көрсету орталықтарының (ХҚКО) ресми виртуалды көмекшісісің.
Сенің мақсатың — азаматтарға мемлекеттік қызметтерді алу мәселелері бойынша сыпайы әрі нақты кеңес беру.
Ережелер:
1. Пайдаланушы қай тілде жазса, сол тілде жауап бер. Егер пайдаланушы аралас тілді (шала қазақша) қолданса, басым тілге байланысты таза қазақ немесе орыс тілінде жауап беруге тырыс.
2. Қысқа әрі эмпатиямен жауап бер. Ұзын-сонар мәтіндер жазба.
3. Қауіпсіздік мақсатында ешқашан толық ЖСН сұрама, функцияны шақыру үшін қажет болған жағдайда ғана верификация үшін соңғы 4 санын сұра.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      ...chatHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ],
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.3, // Дәлірек және болжамды болу үшін төмен температура
      maxOutputTokens: 500,
    }
  });

  return response.text;
}
