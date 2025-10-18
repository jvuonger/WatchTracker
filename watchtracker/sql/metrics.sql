-- Postgres-compatible trimming using percent_rank()
-- Usage: replace $1 with model_id
WITH base AS (
  SELECT price_usd, end_time_utc
  FROM sold_listing
  WHERE model_id = $1
    AND end_time_utc >= now() - interval '90 days'
), ranked AS (
  SELECT price_usd, end_time_utc,
         percent_rank() OVER (ORDER BY price_usd) AS pr
  FROM base
), trimmed AS (
  SELECT price_usd, end_time_utc
  FROM ranked
  WHERE pr BETWEEN 0.02 AND 0.98
), w30 AS (
  SELECT
    avg(price_usd)                        AS mean,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) AS median,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY price_usd) AS p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY price_usd) AS p75,
    count(*)                              AS volume
  FROM trimmed
  WHERE end_time_utc >= now() - interval '30 days'
), w90 AS (
  SELECT
    avg(price_usd)                        AS mean,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) AS median,
    percentile_cont(0.25) WITHIN GROUP (ORDER BY price_usd) AS p25,
    percentile_cont(0.75) WITHIN GROUP (ORDER BY price_usd) AS p75,
    count(*)                              AS volume
  FROM trimmed
)
INSERT INTO model_metric (model_id, window, mean, median, p25, p75, volume, mom_change, yoy_change)
SELECT $1, '30d', w30.mean, w30.median, w30.p25, w30.p75, w30.volume,
       CASE WHEN w90.median > 0 THEN 100.0 * (w30.median - w90.median) / w90.median END,
       NULL
FROM w30, w90;

INSERT INTO model_metric (model_id, window, mean, median, p25, p75, volume, mom_change, yoy_change)
SELECT $1, '90d', w90.mean, w90.median, w90.p25, w90.p75, w90.volume, NULL, NULL;

