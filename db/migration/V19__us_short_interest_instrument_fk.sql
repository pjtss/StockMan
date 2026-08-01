ALTER TABLE us_short_interest_snapshots ADD COLUMN IF NOT EXISTS instrument_id BIGINT;
ALTER TABLE us_short_interest_snapshots ADD CONSTRAINT us_short_interest_snapshots_instrument_fk FOREIGN KEY (instrument_id) REFERENCES us_instruments(id);
