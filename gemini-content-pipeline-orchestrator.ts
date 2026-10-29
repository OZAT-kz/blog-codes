// ==============================================================================
// Cloud Functions (2nd Gen) Gemini 2.5 Flash Audio Pipeline
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/gemini-content-pipeline-orchestrator.ts
// ==============================================================================

import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { GoogleGenAI, Type } from '@google/genai';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase-admin/app';

initializeApp();
const db = getFirestore();
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface GeneratedEeatArticle {
  title: string;
  slug: string;
  metaDescription: string;
  focusKeywords: string[];
  htmlContent: string;
  faqSchema: Array<{ question: string; answer: string }>;
  eeatScoreConfidence: number;
}

export const processAudioToEeatArticle = onObjectFinalized(
  { bucket: 'ozat-voice-notes-vault', memory: '1GiB', timeoutSeconds: 300 },
  async (event) => {
    const filePath = event.data.name;
    if (!filePath.endsWith('.m4a') && !filePath.endsWith('.mp3') && !filePath.endsWith('.txt')) {
      return;
    }

    const bucketName = event.data.bucket;
    const gcsUri = `gs://${bucketName}/${filePath}`;

    const systemInstruction = `Сіз — Google Helpful Content және E-E-A-T (Expertise, Experience, Authoritativeness, Trustworthiness) стандартының бас редакторысыз.
Міндетіңіз:
1. Автордың дауыстық аудиожазбасы немесе транскрипті негізінде толыққанды, терең сараптамалық веб-мақала (1200+ сөз) құрастыру.
2. «Су» мен жалпылама фразаларды толық жою, нақты қазақстандық медициналық/салалық нормаларды, терминдер мен практикалық алгоритмдерді қосу.
3. Google Search үшін міндетті Schema.org/FAQPage микроразметкасын құрылымдау.
4. Қатаң JSON форматында қайтару.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { fileData: { fileUri: gcsUri, mimeType: event.data.contentType || 'audio/mp4' } },
            { text: 'Автордың дауыстық жазбасын Google Helpful Content деңгейіндегі дайын мақалаға айналдыр.' }
          ]
        }
      ],
      config: {
        systemInstruction,
        temperature: 0.2,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            slug: { type: Type.STRING },
            metaDescription: { type: Type.STRING },
            focusKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
            htmlContent: { type: Type.STRING },
            faqSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ['question', 'answer']
              }
            },
            eeatScoreConfidence: { type: Type.NUMBER }
          },
          required: ['title', 'slug', 'metaDescription', 'focusKeywords', 'htmlContent', 'faqSchema', 'eeatScoreConfidence']
        }
      }
    });

    const result = JSON.parse(response.text || '{}') as GeneratedEeatArticle;

    // Слой детерминированной валидации (AI Policy Layer)
    if (result.eeatScoreConfidence < 0.85 || !result.title || !result.htmlContent) {
      console.warn('Статья отклонена политикой качества: недостаточный E-E-A-T скор', result);
      return;
    }

    const postDocRef = db.collection('posts').doc(result.slug);
    await postDocRef.set({
      title: result.title,
      slug: result.slug,
      excerpt: result.metaDescription,
      content: result.htmlContent,
      faqSchema: result.faqSchema,
      author: 'Шарафутдинов Р.',
      category: 'AI & Automation',
      status: 'published',
      publishedAt: FieldValue.serverTimestamp(),
      views: 0
    });

    console.log(`✅ Мақала сәтті жарияланды: ${result.slug}`);
  }
);
