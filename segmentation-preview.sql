-- ==============================================================================
-- Paywall или AdSense? Как мы динамически скрывали рекламу от «китов» с помощью Firebase и Google Analytics
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/segmentation-preview.sql
-- ==============================================================================

user_id | propensity_score | segment
------------------------------------
user_A  | 0.89             | High
user_B  | 0.05             | Low
user_C  | 0.45             | Medium
