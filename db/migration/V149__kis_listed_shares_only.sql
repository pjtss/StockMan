-- Consolidate listed share counts under the KIS price-detail contract.
-- Conditional blocks allow databases created before V72/V134 to migrate safely.
DO $$
BEGIN
  IF to_regclass('public.instrument_fundamental_snapshots') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instrument_fundamental_snapshots' AND column_name='shares_outstanding')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instrument_fundamental_snapshots' AND column_name='listed_shares') THEN
      ALTER TABLE instrument_fundamental_snapshots RENAME COLUMN shares_outstanding TO listed_shares;
    END IF;
    ALTER TABLE instrument_fundamental_snapshots DROP COLUMN IF EXISTS free_float_shares, DROP COLUMN IF EXISTS free_float_percent;
  END IF;
  IF to_regclass('public.instrument_fundamental_history') IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instrument_fundamental_history' AND column_name='shares_outstanding')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='instrument_fundamental_history' AND column_name='listed_shares') THEN
    ALTER TABLE instrument_fundamental_history RENAME COLUMN shares_outstanding TO listed_shares;
  END IF;
END $$;

DROP TABLE IF EXISTS sec_smallcap_share_review CASCADE;
DROP TABLE IF EXISTS sec_smallcap_common_stock_shares CASCADE;
DELETE FROM feature_module_settings WHERE module_key = 'sec-smallcap-share-facts';

DO $$
BEGIN
  IF to_regclass('public.instrument_fundamental_snapshots') IS NOT NULL THEN
    DROP INDEX IF EXISTS instrument_fundamental_screener_cover_idx;
    DROP INDEX IF EXISTS instrument_fundamental_screener_latest_idx;
    CREATE INDEX instrument_fundamental_screener_cover_idx
      ON instrument_fundamental_snapshots (market, code)
      INCLUDE (market_cap, listed_shares, currency, observed_at, fetched_at);
    CREATE INDEX instrument_fundamental_screener_latest_idx
      ON instrument_fundamental_snapshots (market, code, observed_at DESC, fetched_at DESC)
      INCLUDE (market_cap, listed_shares, currency);
  END IF;
END $$;
