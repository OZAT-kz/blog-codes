// ==============================================================================
// BigQuery ML Data Preparation
// Source: OZAT Engineering Hub (https://ozat.kz)
// GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/bq_ml_training_data.sql
// ==============================================================================


-- Оқыту үшін деректер витринасын құру
CREATE OR REPLACE TABLE \`ecommerce_ml.training_data\` AS
WITH user_item_interactions AS (
  SELECT
    user_pseudo_id AS user_id,
    (SELECT value.string_value FROM UNNEST(items) LIMIT 1) AS item_id,
    event_name
  FROM
    \`your-project.analytics_12345.events_*\`
  WHERE
    event_name IN ('view_item', 'add_to_cart', 'purchase')
    AND _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)) AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
)
SELECT
  user_id,
  item_id,
  SUM(
    CASE 
      WHEN event_name = 'view_item' THEN 1
      WHEN event_name = 'add_to_cart' THEN 3
      WHEN event_name = 'purchase' THEN 10
      ELSE 0
    END
  ) AS interaction_score
FROM
  user_item_interactions
WHERE item_id IS NOT NULL
GROUP BY
  user_id, item_id
HAVING interaction_score >= 1;
