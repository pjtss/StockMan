-- Support market-scoped latest-day lookups used by activity refresh and
-- screener diagnostics without scanning the summary table by date alone.
CREATE INDEX IF NOT EXISTS kr_latest_daily_candles_market_date_idx
  ON kr_latest_daily_candles (market, candle_date DESC)
  INCLUDE (code, volume, fetched_at);

CREATE INDEX IF NOT EXISTS us_latest_daily_candles_market_date_idx
  ON us_latest_daily_candles (market, candle_date DESC)
  INCLUDE (code, volume, fetched_at);
