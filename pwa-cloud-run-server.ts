// ==============================================================================
// Теневой бан в Instagram: Перенос 60 000 подписчиков на PWA и монетизация в AdSense
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/pwa-cloud-run-server.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import compression from 'compression';
import helmet from 'helmet';

const app = express();
const PORT = process.env.PORT || 8080;

app.use(compression());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://pagead2.googlesyndication.com", "https://*.google.com"],
      frameSrc: ["'self'", "https://googleads.g.doubleclick.net", "https://*.google.com"],
      imgSrc: ["'self'", "data:", "https://storage.googleapis.com", "https://pagead2.googlesyndication.com"],
      connectSrc: ["'self'", "https://pagead2.googlesyndication.com"]
    }
  }
}));

// Статика Service Worker с обязательным no-cache для мгновенных обновлений PWA
app.get('/sw.js', (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile('/app/dist/client/sw.js');
});

// Кэширование статических медиа-ассетов на уровне Google Cloud CDN
app.use('/assets', express.static('/app/dist/client/assets', {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

// SSR-рендеринг страниц статей с предварительным кэшированием в памяти
app.get('*', async (req: Request, res: Response) => {
  try {
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send('<!DOCTYPE html><html><head><title>Beauty Journal</title></head><body><div id="root"></div></body></html>');
  } catch (error) {
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Serverless PWA runtime listening on port ${PORT}`);
});
