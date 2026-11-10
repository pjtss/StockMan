-- Keep high-volume operational telemetry and intraday cache tables bounded.
-- Daily candle tables are intentionally excluded.
CREATE INDEX CONCURRENTLY IF NOT EXISTS kr_minute_fetch_logs_retention_idx ON kr_minute_fetch_logs (fetched_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS automation_runs_retention_idx ON automation_runs (started_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS debug_run_items_retention_idx ON debug_run_items (completed_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS us_trade_intensity_ticks_retention_idx ON us_trade_intensity_ticks (fetched_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS intraday_detection_transitions_retention_idx ON intraday_detection_transitions (observed_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS us_minute_candles_retention_idx ON us_minute_candles (candle_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS kr_minute_candles_retention_idx ON kr_minute_candles (candle_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS instrument_fundamental_history_retention_idx ON instrument_fundamental_history (fetched_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_translation_cache_retention_idx ON market_rss_translation_cache (updated_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS automation_notification_deliveries_retention_idx ON automation_notification_deliveries (delivery_date);
CREATE INDEX CONCURRENTLY IF NOT EXISTS instrument_universe_sync_runs_retention_idx ON instrument_universe_sync_runs (started_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS discord_delivery_queue_retention_idx ON discord_delivery_queue (updated_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_fetch_snapshots_retention_idx ON market_rss_fetch_snapshots (fetched_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS market_rss_articles_source_snapshot_idx ON market_rss_articles (source_snapshot_id) WHERE source_snapshot_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS sec_source_snapshots_key_fetched_idx ON sec_source_snapshots (source_type, source_key, fetched_at DESC, id DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS intraday_detection_runs_finished_retention_idx ON intraday_detection_runs (finished_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS instrument_candle_cache_retries_retention_idx ON instrument_candle_cache_retries (updated_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS daily_bollinger_cache_retries_retention_idx ON daily_bollinger_cache_retries (updated_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS daily_cache_followup_retries_retention_idx ON daily_cache_followup_retries (updated_at);
