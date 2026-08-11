ALTER TABLE market_rss_articles
  ADD COLUMN IF NOT EXISTS source_snapshot_id BIGINT;

CREATE TABLE IF NOT EXISTS market_rss_fetch_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT market_rss_fetch_source_hash_unique UNIQUE (source, content_hash)
);
CREATE INDEX IF NOT EXISTS market_rss_fetch_fetched_idx ON market_rss_fetch_snapshots(source, fetched_at);

CREATE TABLE IF NOT EXISTS sec_source_snapshots (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  url TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sec_source_snapshot_key_hash_unique UNIQUE (source_type, source_key, content_hash)
);
CREATE INDEX IF NOT EXISTS sec_source_snapshot_fetched_idx ON sec_source_snapshots(source_type, fetched_at);

CREATE TABLE IF NOT EXISTS sec_filing_documents (
  accession TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  form TEXT NOT NULL,
  index_url TEXT NOT NULL,
  primary_url TEXT NOT NULL,
  index_html TEXT NOT NULL DEFAULT '',
  primary_html TEXT NOT NULL DEFAULT '',
  primary_text TEXT NOT NULL DEFAULT '',
  fetched_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
