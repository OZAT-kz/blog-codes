-- ==============================================================================
-- Қазақстанда AdSense тиын әкеле ме? GA4 Predictive Audiences-ті Google Ad Manager-ге беріп, RPM-ді қалай 3 есе өсірдік
-- Source: OZAT Engineering Hub (https://ozat.kz)
-- GitHub: https://github.com/OZAT-kz/blog-codes/blob/main/ga4_propensity_score_kz.sql
-- ==============================================================================

WHERE
    _TABLE_SUFFIX BETWEEN FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 14 DAY)) 
                      AND FORMAT_DATE('%Y%m%d', CURRENT_DATE())
  GROUP BY
    user_pseudo_id
)

SELECT
  user_pseudo_id,
  active_days,
  total_engagement_minutes,
  -- Скорингті қалыптастырамыз. Салмақтар басылуға (CTR) тарихи корреляция негізінде таңдалған
  (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) AS propensity_score,
  
  -- Сегменттерді белгілейміз
  CASE 
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) > 50 THEN 'premium_reader'
    WHEN (active_days * 2) + (deep_scrolls * 1.5) + (total_engagement_minutes * 0.5) BETWEEN 20 AND 50 THEN 'engaged_reader'
    ELSE 'casual_reader'
  END AS audience_segment
FROM
  UserActivity
ORDER BY
  propensity_score DESC;
