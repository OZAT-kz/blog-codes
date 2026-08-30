// ==============================================================================
// Анти-пробки для доставки цветов и еды: Google Maps Routes API (TSP-оптимизация) против грабительских комиссий курьерских агрегаторов
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/google-maps-routes-tsp-delivery-optimizer.ts
// ==============================================================================

┌────────────────────────┐      ┌─────────────────────────────┐      ┌──────────────────────────────┐
│  Заказы из CRM / 1C    │ ===> │  Cloud Run Delivery Engine  │ ===> │  Google Maps Routes API v2   │
│  (Poster, Kaspi, 1C)   │      │  (Node.js 22 LTS / TS)      │      │  (computeRoutes / TSP Solver)│
└────────────────────────┘      └──────────────┬──────────────┘      └──────────────┬───────────────┘
                                               │                                    │
                                               │ Оптимальный маршрут (JSON)         │ Реорганизованный порядок
                                               ▼                                    ▼ waypoints + Polyline
                                ┌─────────────────────────────┐      ┌──────────────────────────────┐
                                │   Telegram Bot / Web App    │ <=== │  Учет пробок (TRAFFIC_AWARE) │
                                │   (Маршрутный лист водителя)│      │  и типа ТС (TWO_WHEELER/CAR) │
                                └─────────────────────────────┘      └──────────────────────────────┘</code></pre>

<h2 class="text-2xl font-bold text-slate-900 mb-4" id="code">3. Реализация TSP-маршрутизатора на TypeScript</h2>

<p class="mb-4">
  Ключевая особенность Google Maps Routes API v2 заключается в заголовке <code>X-Goog-FieldMask</code>. Мы запрашиваем только оптимизированный порядок точек <code>routes.optimizedIntermediateWaypointIndex</code>, продолжительность поездки <code>routes.duration</code> и закодированную полилинию <code>routes.polyline.encodedPolyline</code>.
</p>

<pre><code class="language-typescript">import axios from 'axios';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  address?: string;
  orderId?: string;
}

export interface OptimizedRouteResult {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  formattedDuration: string;
  optimizedOrder: LocationPoint[];
  encodedPolyline: string;
}

export class GoogleMapsRoutesOptimizer {
  private readonly apiKey: string;
  private readonly endpoint = 'https://routes.googleapis.com/directions/v2:computeRoutes';

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('GOOGLE_MAPS_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  async optimizeDeliveryRoute(
    origin: LocationPoint,
    destinations: LocationPoint[],
    vehicleType: 'DRIVE' | 'TWO_WHEELER' = 'DRIVE'
  ): Promise<OptimizedRouteResult> {
    if (destinations.length === 0) {
      throw new Error('At least one delivery waypoint required');
    }
    if (destinations.length > 25) {
      throw new Error('Google Maps Routes API supports max 25 intermediate waypoints per call');
    }

    const payload = {
      origin: {
        location: {
          latLng: { latitude: origin.latitude, longitude: origin.longitude }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: destinations[destinations.length - 1].latitude,
            longitude: destinations[destinations.length - 1].longitude
          }
        }
      },
      intermediates: destinations.slice(0, -1).map(point => ({
        location: {
          latLng: { latitude: point.latitude, longitude: point.longitude }
        }
      })),
      travelMode: vehicleType,
      routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
      optimizeWaypointOrder: true,
      computeAlternativeRoutes: false,
      languageCode: 'ru-KZ',
      units: 'METRIC'
    };

    const response = await axios.post(this.endpoint, payload, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.optimizedIntermediateWaypointIndex,routes.polyline.encodedPolyline'
      }
    });

    const route = response.data.routes?.[0];
    if (!route) {
      throw new Error('No route returned by Google Maps API');
    }

    const permutation: number[] = route.optimizedIntermediateWaypointIndex || [];
    const reorderedIntermediates = permutation.map(idx => destinations[idx]);
    const finalDest = destinations[destinations.length - 1];
    const orderedPoints = [origin, ...reorderedIntermediates, finalDest];

    const durationSeconds = parseInt(route.duration.replace('s', ''), 10);
    const minutes = Math.round(durationSeconds / 60);

    return {
      totalDistanceMeters: route.distanceMeters,
      totalDurationSeconds: durationSeconds,
      formattedDuration: `${minutes} мин`,
      optimizedOrder: orderedPoints,
      encodedPolyline: route.polyline?.encodedPolyline || ''
    };
  }
}
