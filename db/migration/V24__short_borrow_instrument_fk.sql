ALTER TABLE short_borrow_snapshots
  ADD COLUMN IF NOT EXISTS instrument_id BIGINT;

UPDATE short_borrow_snapshots s
SET instrument_id = i.id
FROM us_instruments i
WHERE i.code = upper(s.symbol)
  AND s.instrument_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'short_borrow_snapshots_instrument_fk') THEN
    ALTER TABLE short_borrow_snapshots ADD CONSTRAINT short_borrow_snapshots_instrument_fk
      FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
  END IF;
END $$;
