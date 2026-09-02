CREATE TABLE IF NOT EXISTS user_watchlist (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, market, code)
);
CREATE INDEX IF NOT EXISTS user_watchlist_user_idx ON user_watchlist(user_id, created_at DESC);
