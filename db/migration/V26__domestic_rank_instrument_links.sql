ALTER TABLE top_rising_stocks ADD COLUMN IF NOT EXISTS instrument_id BIGINT;
ALTER TABLE top_intensity_stocks ADD COLUMN IF NOT EXISTS instrument_id BIGINT;

UPDATE top_rising_stocks s
SET instrument_id = i.id
FROM us_instruments i
WHERE i.market = 'KRX' AND i.code = s.code AND s.instrument_id IS NULL;

UPDATE top_intensity_stocks s
SET instrument_id = i.id
FROM us_instruments i
WHERE i.market = 'KRX' AND i.code = s.code AND s.instrument_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'top_rising_stocks_instrument_fk') THEN
    ALTER TABLE top_rising_stocks ADD CONSTRAINT top_rising_stocks_instrument_fk
      FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'top_intensity_stocks_instrument_fk') THEN
    ALTER TABLE top_intensity_stocks ADD CONSTRAINT top_intensity_stocks_instrument_fk
      FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
  END IF;
END $$;
