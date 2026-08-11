ALTER TABLE kr_instruments
  ADD COLUMN IF NOT EXISTS product_status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS classification_reason TEXT;

UPDATE kr_instruments
SET product_status = 'INACTIVE_EXCLUDED',
    enabled = FALSE,
    classification_reason = '기존 명칭 기반 ETF·레버리지·파생상품 제외'
WHERE name ~* '(ETF|ETN|ETP|상장지수|인덱스|펀드|수익증권|레버리지|leverag|인버스|inverse|short|bear|bull|울트라|ultra|선물|옵션|option|ELW|warrant|신주인수권)';

CREATE INDEX IF NOT EXISTS kr_instruments_product_status_idx
  ON kr_instruments (product_status, enabled, code);

CREATE OR REPLACE FUNCTION reject_excluded_kr_instrument_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name ~* '(ETF|ETN|ETP|상장지수|인덱스|펀드|수익증권|레버리지|leverag|인버스|inverse|short|bear|bull|울트라|ultra|선물|옵션|option|ELW|warrant|신주인수권)' THEN
    RAISE EXCEPTION 'excluded KR product cannot be inserted: %', NEW.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS kr_instruments_reject_excluded_insert ON kr_instruments;
CREATE TRIGGER kr_instruments_reject_excluded_insert
BEFORE INSERT ON kr_instruments
FOR EACH ROW EXECUTE FUNCTION reject_excluded_kr_instrument_insert();
