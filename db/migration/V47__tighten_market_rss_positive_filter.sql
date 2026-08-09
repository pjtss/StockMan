-- Keep historical RSS rows consistent with the stricter catalyst-only filter.
-- General articles remain available in the debugger but are not Discord
-- candidates unless a concrete event rule matched at ingestion time.
UPDATE market_rss_articles
SET notify_eligible = FALSE,
    priority = 20
WHERE category = 'GENERAL'
  AND notify_eligible = TRUE;

-- SEC Atom titles contain issuer legal names.  In particular, "Acquisition
-- Corp." is not evidence of an acquisition event.  Correct only rows whose
-- summary also lacks the SEC event text that would justify an alert.
UPDATE market_rss_articles
SET category = 'GENERAL',
    priority = 20,
    notify_eligible = FALSE,
    event_direction = 'NEUTRAL',
    matched_terms = '{}'::text[],
    financing_amount_usd = NULL,
    dilution_risk = 'UNKNOWN'
WHERE source = 'SEC_EDGAR'
  AND title ~* 'Acquisition Corp\.'
  AND title ~* '\([0-9]{10}\) \(Filer\)'
  AND matched_terms @> ARRAY['acquisition']::text[]
  AND summary !~* '(Item[[:space:]]+1\.01|material definitive agreement|business combination|acquisition[[:space:]]+(of|agreement)|merger[[:space:]]+with|offering|financing|clinical|approval|contract|partnership)';

-- Do not retain derivative symbols as the SEC article's primary market ticker.
-- Common class shares such as BH-A are intentionally preserved.
UPDATE market_rss_articles
SET detected_ticker = NULL
WHERE source = 'SEC_EDGAR'
  AND detected_ticker ~* '(-UN|-U|-WT|-W|-WS|-WW|-RT|-R|-P[A-Z]?)$';
