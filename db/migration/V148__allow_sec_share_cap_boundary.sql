ALTER TABLE sec_smallcap_common_stock_shares
  DROP CONSTRAINT IF EXISTS sec_smallcap_common_stock_shares_positive_cap,
  ADD CONSTRAINT sec_smallcap_common_stock_shares_positive_cap
    CHECK (market_cap_usd > 0 AND market_cap_usd <= 100000000);
