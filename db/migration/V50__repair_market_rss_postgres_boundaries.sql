-- PostgreSQL uses \m and \M for word boundaries in its ARE regular
-- expressions.  Re-run the historical RSS repairs with those boundaries so
-- rows written before the classifier fix are actually updated.

UPDATE market_rss_articles
SET
  detected_ticker = UPPER(substring(title FROM '\|[[:space:]]*([A-Z]{1,5})[[:space:]]+Stock[[:space:]]+News')),
  updated_at = NOW()
WHERE source = 'STOCKTITAN'
  AND title ~* '\|[[:space:]]*[A-Z]{1,5}[[:space:]]+Stock[[:space:]]+News'
  AND detected_ticker IS DISTINCT FROM UPPER(substring(title FROM '\|[[:space:]]*([A-Z]{1,5})[[:space:]]+Stock[[:space:]]+News'));

UPDATE market_rss_articles
SET
  matched_terms = array_remove(matched_terms, 'ATM'),
  category = CASE
    WHEN title ~* '\mFDA\M|clinical trial|phase [123]|\mapproval\M|\mcontract\M|\mpartnership\M|acquir(es?|ed)|acquisition[[:space:]]+(of|agreement|completed|announced|to)|merger([[:space:]]+with| agreement)|\mfunding\M|\mlaunch(es|ed)?\M|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 'ACTIONABLE'
    ELSE 'GENERAL'
  END,
  priority = CASE
    WHEN title ~* '\mFDA\M|clinical trial|phase [123]|\mapproval\M|\mcontract\M|\mpartnership\M|acquir(es?|ed)|acquisition[[:space:]]+(of|agreement|completed|announced|to)|merger([[:space:]]+with| agreement)|\mfunding\M|\mlaunch(es|ed)?\M|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 100
    ELSE 20
  END,
  notify_eligible = title ~* '\mFDA\M|clinical trial|phase [123]|\mapproval\M|\mcontract\M|\mpartnership\M|acquir(es?|ed)|acquisition[[:space:]]+(of|agreement|completed|announced|to)|merger([[:space:]]+with| agreement)|\mfunding\M|\mlaunch(es|ed)?\M|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달',
  event_direction = CASE
    WHEN title ~* '\mFDA\M|clinical trial|phase [123]|\mapproval\M|\mcontract\M|\mpartnership\M|acquir(es?|ed)|acquisition[[:space:]]+(of|agreement|completed|announced|to)|merger([[:space:]]+with| agreement)|\mfunding\M|\mlaunch(es|ed)?\M|material definitive agreement|business combination|상장|인수|계약|임상|승인|자금 조달'
      THEN 'POSITIVE'
    ELSE 'NEUTRAL'
  END,
  financing_amount_usd = NULL,
  dilution_risk = 'UNKNOWN',
  updated_at = NOW()
WHERE source = 'STOCKTITAN'
  AND 'ATM' = ANY(matched_terms)
  AND title !~* '\mATM\M'
  AND title !~* '\moffering\M|registered direct|\mPIPE\M|convertible|\mwarrants?\M|\mfinancing\M|public offering'
  AND category = 'FINANCING';
