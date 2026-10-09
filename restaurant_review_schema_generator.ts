// ==============================================================================
// Казахстанский E-E-A-T: как локальный фудблогер/ресторанный гид вышел на первое место в Google без ссылочных бирж и монетизировал 50 000 читателей через Ad Manager
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/restaurant_review_schema_generator.ts
// ==============================================================================

interface RestaurantReviewData {
  restaurantName: string;
  streetAddress: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  servesCuisine: string[];
  priceRange: string;
  ratingValue: number;
  bestRating: number;
  reviewBody: string;
  authorName: string;
  authorUrl: string;
  datePublished: string;
}

export function generateRestaurantEeatSchema(data: RestaurantReviewData): string {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": "Restaurant",
      "name": data.restaurantName,
      "image": "https://almaty-food.kz/static/photos/review-cover.webp",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": data.streetAddress,
        "addressLocality": data.city,
        "postalCode": data.postalCode,
        "addressCountry": "KZ"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": data.latitude,
        "longitude": data.longitude
      },
      "servesCuisine": data.servesCuisine,
      "priceRange": data.priceRange
    },
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": data.ratingValue,
      "bestRating": data.bestRating,
      "worstRating": 1
    },
    "author": {
      "@type": "Person",
      "name": data.authorName,
      "url": data.authorUrl,
      "jobTitle": "Гастрономический критик и независимый обозреватель",
      "sameAs": [
        "https://instagram.com/almaty.foodie",
        "https://t.me/almaty_tasty_guide"
      ]
    },
    "datePublished": data.datePublished,
    "reviewBody": data.reviewBody,
    "publisher": {
      "@type": "Organization",
      "name": "Almaty Culinary Guide",
      "logo": {
        "@type": "ImageObject",
        "url": "https://almaty-food.kz/logo.png"
      }
    }
  };

  return JSON.stringify(schema, null, 2);
}
