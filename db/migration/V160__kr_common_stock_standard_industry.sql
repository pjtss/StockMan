ALTER TABLE kr_common_stock_universe
  ADD COLUMN IF NOT EXISTS standard_industry_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS standard_industry_name TEXT NOT NULL DEFAULT '';

ALTER TABLE kr_special_instrument_universe
  ADD COLUMN IF NOT EXISTS standard_industry_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS standard_industry_name TEXT NOT NULL DEFAULT '';
