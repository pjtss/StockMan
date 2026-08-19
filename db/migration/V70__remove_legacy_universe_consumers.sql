-- The new instrument-universe tables are the sole canonical universe.
-- Remove legacy consumers before removing the old identity tables. Every
-- table in this list is FK-bound to the old universe or belongs to a feature
-- intentionally retired with that universe.
DROP TABLE IF EXISTS us_daily_breakout_watchlist CASCADE;
DROP TABLE IF EXISTS us_turnover_watchlist_alert_state CASCADE;
DROP TABLE IF EXISTS us_turnover_watchlist CASCADE;
DROP TABLE IF EXISTS us_turnover_ratio_snapshot_attempts CASCADE;
DROP TABLE IF EXISTS us_turnover_ratio_blacklist CASCADE;
DROP TABLE IF EXISTS us_turnover_ratio_snapshots CASCADE;
DROP TABLE IF EXISTS us_trade_intensity_ticks CASCADE;
DROP TABLE IF EXISTS us_intraday_vwap_alerts CASCADE;
DROP TABLE IF EXISTS us_intraday_vwap_snapshots CASCADE;
DROP TABLE IF EXISTS us_free_float_refresh_history CASCADE;
DROP TABLE IF EXISTS us_free_float_diagnostics CASCADE;
DROP TABLE IF EXISTS us_free_float_snapshots CASCADE;
DROP TABLE IF EXISTS us_news_ticker_exchange_cache CASCADE;
DROP TABLE IF EXISTS us_news_radar_events CASCADE;
DROP TABLE IF EXISTS us_short_metrics CASCADE;
DROP TABLE IF EXISTS us_short_interest_snapshots CASCADE;
DROP TABLE IF EXISTS short_borrow_snapshots CASCADE;
DROP TABLE IF EXISTS us_turnover_symbols CASCADE;
DROP TABLE IF EXISTS top_rising_stocks CASCADE;
DROP TABLE IF EXISTS top_intensity_stocks CASCADE;
DROP TABLE IF EXISTS kr_market_snapshots CASCADE;
DROP TABLE IF EXISTS us_daily_price_candles CASCADE;
DROP TABLE IF EXISTS kr_daily_price_candles CASCADE;
DROP TABLE IF EXISTS us_instruments CASCADE;
DROP TABLE IF EXISTS kr_instruments CASCADE;
