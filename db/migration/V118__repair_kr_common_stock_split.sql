-- V85 used `managed_issue_code <> 'Y'`, which excludes NULL values in
-- PostgreSQL. On installations imported before that condition was fixed,
-- valid common stocks were therefore placed in the special table and their
-- candles were removed by the same migration. Restore them idempotently.
INSERT INTO kr_common_stock_universe (
  market, code, standard_code, name, instrument_type, security_group_code,
  market_cap_scale, industry_large_code, industry_medium_code,
  industry_small_code, enabled, is_etp, is_warrant, is_preferred,
  is_suspended, source_file, raw_payload, first_seen_at, last_seen_at,
  missing_runs, created_at, updated_at
)
SELECT
  s.market, s.code, s.standard_code, s.name, s.instrument_type,
  s.security_group_code, s.market_cap_scale, s.industry_large_code,
  s.industry_medium_code, s.industry_small_code, s.enabled, s.is_etp,
  s.is_warrant, s.is_preferred, s.is_suspended, s.source_file,
  s.raw_payload, s.first_seen_at, s.last_seen_at, s.missing_runs,
  s.created_at, s.updated_at
FROM kr_special_instrument_universe s
WHERE s.instrument_type = 'COMMON_STOCK'
  AND COALESCE(s.is_suspended, false) = false
  AND COALESCE(s.managed_issue_code, '') <> 'Y'
ON CONFLICT (market, code) DO UPDATE SET
  name = EXCLUDED.name,
  instrument_type = EXCLUDED.instrument_type,
  enabled = EXCLUDED.enabled,
  is_suspended = EXCLUDED.is_suspended,
  raw_payload = EXCLUDED.raw_payload,
  last_seen_at = EXCLUDED.last_seen_at,
  updated_at = EXCLUDED.updated_at;

DELETE FROM kr_special_instrument_universe s
WHERE s.instrument_type = 'COMMON_STOCK'
  AND COALESCE(s.is_suspended, false) = false
  AND COALESCE(s.managed_issue_code, '') <> 'Y'
  AND EXISTS (
    SELECT 1 FROM kr_common_stock_universe c
    WHERE c.market = s.market AND c.code = s.code
  );
