-- Persist provider timestamp precision so disclosure reads do not parse each
-- article's raw RSS payload in SQL and again in application code.
ALTER TABLE market_rss_articles
  ADD COLUMN IF NOT EXISTS rss_timestamp_precision TEXT NOT NULL DEFAULT 'UNKNOWN',
  ADD COLUMN IF NOT EXISTS rss_published_date TEXT;

WITH raw_timestamps AS (
  SELECT
    id,
    COALESCE(
      substring(raw_payload from '"pubDate"[[:space:]]*:[[:space:]]*"([^"]*)"'),
      substring(raw_payload from '"published"[[:space:]]*:[[:space:]]*"([^"]*)"'),
      substring(raw_payload from '"updated"[[:space:]]*:[[:space:]]*"([^"]*)"'),
      ''
    ) AS raw_timestamp,
    published_at
  FROM market_rss_articles
  WHERE rss_timestamp_precision = 'UNKNOWN'
), classified AS (
  SELECT
    id,
    raw_timestamp,
    CASE
      WHEN raw_timestamp ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN 'DATE'
      WHEN published_at IS NOT NULL
        AND raw_timestamp ~* '([T ][0-9]{1,2}:[0-9]{2}).*(Z|[+-][0-9]{2}:?[0-9]{2}|GMT|UTC)$'
        THEN 'INSTANT'
      ELSE 'UNKNOWN'
    END AS precision
  FROM raw_timestamps
)
UPDATE market_rss_articles AS article
SET rss_timestamp_precision = classified.precision,
    rss_published_date = CASE WHEN classified.precision = 'DATE' THEN classified.raw_timestamp ELSE NULL END
FROM classified
WHERE article.id = classified.id;

CREATE INDEX IF NOT EXISTS market_rss_articles_rss_date_idx
  ON market_rss_articles (rss_published_date, source, id)
  WHERE rss_timestamp_precision = 'DATE';

CREATE INDEX IF NOT EXISTS market_rss_articles_rss_instant_order_idx
  ON market_rss_articles (published_at DESC NULLS LAST, id DESC)
  WHERE rss_timestamp_precision = 'INSTANT';
