CREATE TABLE IF NOT EXISTS kr_minute_fetch_logs (
  id BIGSERIAL PRIMARY KEY,
  market TEXT NOT NULL,
  code TEXT NOT NULL,
  request_date TEXT NOT NULL,
  request_time TEXT NOT NULL,
  http_status INTEGER,
  response_code TEXT,
  response_message TEXT,
  response_count INTEGER,
  request_url TEXT NOT NULL,
  raw_payload TEXT NOT NULL DEFAULT '',
  parsed_payload TEXT NOT NULL DEFAULT '',
  ok BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS kr_minute_fetch_logs_lookup_idx ON kr_minute_fetch_logs (market, code, fetched_at DESC);
