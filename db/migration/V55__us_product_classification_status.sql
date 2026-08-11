ALTER TABLE us_instruments
  ADD COLUMN IF NOT EXISTS product_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS classification_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classification_reason TEXT;

UPDATE us_instruments
SET product_status = 'INACTIVE_EXCLUDED',
    enabled = FALSE,
    classification_reason = COALESCE(classification_reason, 'legacy product classification')
WHERE is_etf OR is_leveraged OR is_inverse OR is_derivative_product
   OR instrument_type <> 'COMMON_STOCK';

UPDATE us_instruments
SET manual_product_action = NULL
WHERE product_status = 'INACTIVE_EXCLUDED';

CREATE INDEX IF NOT EXISTS us_instruments_product_status_idx
  ON us_instruments (product_status, enabled, market, code);

CREATE OR REPLACE FUNCTION reject_excluded_us_instrument_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.market IN ('NAS', 'NYS', 'AMS') AND (
    NEW.is_etf OR NEW.is_leveraged OR NEW.is_inverse OR NEW.is_derivative_product
    OR NEW.instrument_type <> 'COMMON_STOCK'
    OR NEW.name ~* '(ETF|ETN|ETP|FUND|TRUST|INDEX|INVERSE|LEVERAG|ULTRA|DIREXION|PROSHARES|WARRANT|RIGHT|UNIT|OPTION|PREFERRED|인버스|레버리지)'
  ) THEN
    RAISE EXCEPTION 'excluded US product cannot be inserted: %:%', NEW.market, NEW.code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS us_instruments_reject_excluded_insert ON us_instruments;
CREATE TRIGGER us_instruments_reject_excluded_insert
BEFORE INSERT ON us_instruments
FOR EACH ROW EXECUTE FUNCTION reject_excluded_us_instrument_insert();
