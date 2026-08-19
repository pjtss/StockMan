ALTER TABLE kr_instrument_universe
  ADD COLUMN IF NOT EXISTS etp_product_class_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS preferred_class_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS trading_halt_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS liquidation_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS managed_issue_code text NOT NULL DEFAULT '';

COMMENT ON COLUMN kr_instrument_universe.etp_product_class_code IS 'KIS official 국내주식 마스터 etp_prod_cls_code';
COMMENT ON COLUMN kr_instrument_universe.preferred_class_code IS 'KIS official 국내주식 마스터 prst_cls_code';
COMMENT ON COLUMN kr_instrument_universe.trading_halt_code IS 'KIS official 국내주식 마스터 trht_yn';
COMMENT ON COLUMN kr_instrument_universe.liquidation_code IS 'KIS official 국내주식 마스터 sltr_yn';
COMMENT ON COLUMN kr_instrument_universe.managed_issue_code IS 'KIS official 국내주식 마스터 mang_issu_yn';
