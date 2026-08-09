-- Reclassify historical StockTitan rows that were written before the
-- boundary-aware classifier and canonical StockTitan ticker extraction.

-- StockTitan's canonical symbol is the token before "Stock News".  Older
-- rows could incorrectly persist a parenthesized abbreviation from the title
-- (for example BLA or R) instead of the listed symbol after the pipe.
UPDATE market_rss_articles
SET
  detected_ticker = UPPER(substring(title FROM '\|\s*([A-Z]{1,5})\s+Stock\s+News\b')),
  updated_at = NOW()
WHERE source = 'STOCKTITAN'
  AND title ~* '\|\s*[A-Z]{1,5}\s+Stock\s+News\b'
  AND detected_ticker IS DISTINCT FROM UPPER(substring(title FROM '\|\s*([A-Z]{1,5})\s+Stock\s+News\b'));

-- "ATM" was previously matched as a substring of words such as
-- "treatment".  Remove that false financing signal and recalculate the
-- persisted outcome from the remaining actionable headline terms.
UPDATE market_rss_articles
SET
  matched_terms = array_remove(matched_terms, 'ATM'),
  category = CASE
    WHEN title ~* '\bfda\b|clinical trial|phase [123]|\bapproval\b|\bcontract\b|\bpartnership\b|acquir(es?|ed)|acquisition\s+(of|agreement|completed|announced|to)|merger(\s+with| agreement)|\bfunding\b|\blaunch(es|ed)?\b|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 'ACTIONABLE'
    ELSE 'GENERAL'
  END,
  priority = CASE
    WHEN title ~* '\bfda\b|clinical trial|phase [123]|\bapproval\b|\bcontract\b|\bpartnership\b|acquir(es?|ed)|acquisition\s+(of|agreement|completed|announced|to)|merger(\s+with| agreement)|\bfunding\b|\blaunch(es|ed)?\b|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 100
    ELSE 20
  END,
  notify_eligible = title ~* '\bfda\b|clinical trial|phase [123]|\bapproval\b|\bcontract\b|\bpartnership\b|acquir(es?|ed)|acquisition\s+(of|agreement|completed|announced|to)|merger(\s+with| agreement)|\bfunding\b|\blaunch(es|ed)?\b|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달',
  event_direction = CASE
    WHEN title ~* '\bfda\b|clinical trial|phase [123]|\bapproval\b|\bcontract\b|\bpartnership\b|acquir(es?|ed)|acquisition\s+(of|agreement|completed|announced|to)|merger(\s+with| agreement)|\bfunding\b|\blaunch(es|ed)?\b|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 'POSITIVE'
    ELSE 'NEUTRAL'
  END,
  financing_amount_usd = NULL,
  dilution_risk = 'UNKNOWN',
  updated_at = NOW()
WHERE source = 'STOCKTITAN'
  AND 'ATM' = ANY(matched_terms)
  AND title !~* '\batm\b'
  AND title !~* '\boffering\b|registered direct|\bpipe\b|convertible|\bwarrants?\b|\bfinancing\b|public offering'
  AND category = 'FINANCING';
