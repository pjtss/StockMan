ALTER TABLE sec_smallcap_common_stock_shares
  ADD COLUMN IF NOT EXISTS dei_shares_outstanding BIGINT,
  ADD COLUMN IF NOT EXISTS dei_fact_end_date DATE,
  ADD COLUMN IF NOT EXISTS dei_fact_filed_date DATE,
  ADD COLUMN IF NOT EXISTS dei_fact_form TEXT,
  ADD COLUMN IF NOT EXISTS dei_fact_accession_number TEXT,
  ADD COLUMN IF NOT EXISTS us_gaap_shares_outstanding BIGINT,
  ADD COLUMN IF NOT EXISTS us_gaap_fact_end_date DATE,
  ADD COLUMN IF NOT EXISTS us_gaap_fact_filed_date DATE,
  ADD COLUMN IF NOT EXISTS us_gaap_fact_form TEXT,
  ADD COLUMN IF NOT EXISTS us_gaap_fact_accession_number TEXT;

-- Existing rows contain the DEI fact in the legacy generic columns.
UPDATE sec_smallcap_common_stock_shares
   SET dei_shares_outstanding = shares_outstanding,
       dei_fact_end_date = fact_end_date,
       dei_fact_filed_date = fact_filed_date,
       dei_fact_accession_number = fact_accession_number
 WHERE dei_shares_outstanding IS NULL;

ALTER TABLE sec_smallcap_common_stock_shares
  DROP CONSTRAINT IF EXISTS sec_smallcap_common_stock_shares_positive_shares,
  DROP COLUMN IF EXISTS shares_outstanding,
  DROP COLUMN IF EXISTS fact_end_date,
  DROP COLUMN IF EXISTS fact_filed_date,
  DROP COLUMN IF EXISTS fact_accession_number;

ALTER TABLE sec_smallcap_common_stock_shares
  ADD CONSTRAINT sec_smallcap_common_stock_shares_positive_dei_shares
    CHECK (dei_shares_outstanding IS NULL OR dei_shares_outstanding > 0),
  ADD CONSTRAINT sec_smallcap_common_stock_shares_positive_us_gaap_shares
    CHECK (us_gaap_shares_outstanding IS NULL OR us_gaap_shares_outstanding > 0),
  ADD CONSTRAINT sec_smallcap_common_stock_shares_has_fact
    CHECK (dei_shares_outstanding IS NOT NULL OR us_gaap_shares_outstanding IS NOT NULL);
