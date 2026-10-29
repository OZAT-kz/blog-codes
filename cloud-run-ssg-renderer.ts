// ==============================================================================
// Cloud Run Fast SSG Article Renderer with Cloud CDN
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud-run-ssg-renderer.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import compression from 'compression';

const app = express();
app.use(compression());
const db = getFirestore();

// Кеширование на уровне Google Cloud CDN и Anycast IP
app.get('/article/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;
  const docSnap = await db.collection('posts').doc(slug).get();

  if (!docSnap.exists) {
    return res.status(404).send('Мақала табылмады');
  }

  const post = docSnap.data();

  // Долговременный заголовок кеширования Cloud CDN: мгновенная отдача роботам Googlebot
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  const faqSchemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    'mainEntity': (post?.faqSchema || []).map((faq: any) => ({
      '@type': 'Question',
      'name': faq.question,
      'acceptedAnswer': {
        '@type': 'Answer',
        'text': faq.answer
      }
    }))
  });

  const fullHtml = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>${post?.title} — OZAT</title>
  <meta name="description" content="${post?.excerpt}">
  <script type="application/ld+json">${faqSchemaJson}</script>
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-6425126831032338" crossorigin="anonymous"></script>
</head>
<body class="bg-white text-slate-900 font-sans">
  <article class="max-w-3xl mx-auto px-4 py-8">
    <h1 class="text-3xl font-extrabold mb-4">${post?.title}</h1>
    <div class="prose max-w-none mb-8">${post?.content}</div>
  </article>
</body>
</html>`;

  return res.send(fullHtml);
});

export default app;
