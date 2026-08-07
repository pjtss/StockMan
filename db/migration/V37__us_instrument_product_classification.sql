ALTER TABLE us_instruments
  ADD COLUMN IF NOT EXISTS is_etf BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_leveraged BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_inverse BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_derivative_product BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS classification_source TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  ADD COLUMN IF NOT EXISTS classification_confidence NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS manual_product_action TEXT;

CREATE INDEX IF NOT EXISTS us_instruments_product_filter_idx
  ON us_instruments (enabled, is_etf, is_leveraged, is_inverse, is_derivative_product);

UPDATE us_instruments
SET is_etf = TRUE,
    classification_source = 'NAME_BACKFILL',
    classification_confidence = 0.7000
WHERE NOT is_etf AND (name ~* '(ETF|ETN|ETP|fund|trust|inverse|leverag|인버스|레버리지|\m(short)\M|\m(ultra)\M)');

UPDATE us_instruments
SET is_leveraged = TRUE,
    classification_source = 'NAME_BACKFILL',
    classification_confidence = 0.7000
WHERE NOT is_leveraged AND name ~* '(leverag|ultra|ultrapro|\m(bull)\M|\m(bear)\M|\m(2x)\M|\m(3x)\M|\m(2x)\M|\m(short)\M)';

UPDATE us_instruments
SET is_inverse = TRUE,
    classification_source = 'NAME_BACKFILL',
    classification_confidence = 0.7000
WHERE NOT is_inverse AND name ~* '(inverse|인버스|\m(short)\M|\m(bear)\M)';
