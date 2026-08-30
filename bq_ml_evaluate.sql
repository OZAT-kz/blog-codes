// ==============================================================================
// BigQuery ML Model Evaluation
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bq_ml_evaluate.sql
// ==============================================================================


-- Модельді бағалау
SELECT * FROM ML.EVALUATE(MODEL \`ecommerce_ml.item_recommender\`);
