// ==============================================================================
// Node.js Redis Recommendation Cache
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/node_redis_recs.js
// ==============================================================================


// Node.js-тегі бэкендтің псевдокоды
async function getRecommendations(userId) {
  // Redis-тен дербес ұсыныстарды табуға тырысамыз
  let recs = await redis.get(\`recs:\${userId}\`);
  
  if (!recs) {
    // Егер юзер жаңа немесе инкогнито болса — жаһандық сатылым хиттерін береміз
    // Бұл кестені біз де алдын ала BQ-де есептеп, Redis-ке саламыз!
    recs = await redis.get('recs:global_top_sellers');
  }
  
  return expandItemsFromDatabase(recs);
}
