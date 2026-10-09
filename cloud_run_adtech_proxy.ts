// ==============================================================================
// Анатомия AdTech-арбитража в Алматы: как инфлюенсерам выжать максимальный CPC (до 450 ₸ за клик), стравив Google Ad Manager и РСЯ через Prebid.js на Google Cloud
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/cloud_run_adtech_proxy.ts
// ==============================================================================

import express, { Request, Response } from 'express';
import compression from 'compression';

const app = express();
const PORT = process.env.PORT || 8080;

interface GeoAdFloorPolicy {
  minFloorUSD: number;
  currency: string;
  preferredBidders: string[];
}

const KAZAKHSTAN_GEO_FLOORS: Record<string, GeoAdFloorPolicy> = {
  'Almaty': { minFloorUSD: 0.85, currency: 'USD', preferredBidders: ['yandex', 'rubicon', 'criteo'] },
  'Astana': { minFloorUSD: 0.75, currency: 'USD', preferredBidders: ['yandex', 'rubicon'] },
  'Shymkent': { minFloorUSD: 0.50, currency: 'USD', preferredBidders: ['yandex'] },
  'Default': { minFloorUSD: 0.40, currency: 'USD', preferredBidders: ['yandex'] }
};

app.use(compression());

app.get('/api/adtech/auction-config', (req: Request, res: Response) => {
  const cityHeader = (req.headers['x-client-city'] as string) || 'Default';
  const policy = KAZAKHSTAN_GEO_FLOORS[cityHeader] || KAZAKHSTAN_GEO_FLOORS['Default'];

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
  res.setHeader('Content-Type', 'application/json');

  res.json({
    timeoutMs: 650,
    geoCity: cityHeader,
    floorPriceCpm: policy.minFloorUSD,
    currency: policy.currency,
    bidders: policy.preferredBidders,
    priceGranularity: {
      buckets: [
        { max: 5.0, increment: 0.05 },
        { max: 15.0, increment: 0.25 },
        { max: 30.0, increment: 1.00 }
      ]
    }
  });
});

app.listen(PORT, () => {
  console.log(`AdTech Edge Gateway active on port ${PORT}`);
});
