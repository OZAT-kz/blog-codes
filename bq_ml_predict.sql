// ==============================================================================
// BigQuery ML Prediction (Recommendations)
// Source: OZAT Engineering Blog (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bq_ml_predict.sql
// ==============================================================================


-- Ұсыныстарды алу
CREATE OR REPLACE TABLE \`ecommerce_ml.user_recommendations\` AS
SELECT
  user_id,
  ARRAY_AGG(STRUCT(item_id, predicted_interaction_score) ORDER BY predicted_interaction_score DESC LIMIT 5) AS recommended_items
FROM
  ML.RECOMMEND(MODEL \`ecommerce_ml.item_recommender\`)
GROUP BY
  user_id;
