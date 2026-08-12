-- KIS domestic ranking may omit product metadata, so enforce the same name
-- fallback rules at the database boundary for legacy and future rows.
UPDATE kr_instruments
SET product_status = 'INACTIVE_EXCLUDED',
    enabled = FALSE,
    classification_reason = '국내 ETF·펀드·우선주·스팩 명칭 기반 제외'
WHERE name ~* '(ETF|ETN|ETP|상장지수|인덱스|펀드|수익증권|액티브|TDF|레버리지|leverag|인버스|inverse|short|bear|bull|울트라|ultra|선물|옵션|option|ELW|warrant|신주인수권|스팩|SPAC|통안채|국고채|회사채|채권|SOFR|MSCI|S&P|코스피[[:space:]]*[0-9]+|코스닥[[:space:]]*[0-9]+|(^|[[:space:]])(KODEX|TIGER|PLUS|SOL|ACE|HANARO|KBSTAR|KOSEF|KIWOOM|TREX|RISE|ARIRANG|TIMEFOLIO|WON|UNICORN|마이티|파워|FOCUS|히어로즈|BNK|KTOP)([[:space:]]|$)|우선주|[0-9]?우B?$)';

CREATE OR REPLACE FUNCTION reject_excluded_kr_instrument_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.name ~* '(ETF|ETN|ETP|상장지수|인덱스|펀드|수익증권|액티브|TDF|레버리지|leverag|인버스|inverse|short|bear|bull|울트라|ultra|선물|옵션|option|ELW|warrant|신주인수권|스팩|SPAC|통안채|국고채|회사채|채권|SOFR|MSCI|S&P|코스피[[:space:]]*[0-9]+|코스닥[[:space:]]*[0-9]+|(^|[[:space:]])(KODEX|TIGER|PLUS|SOL|ACE|HANARO|KBSTAR|KOSEF|KIWOOM|TREX|RISE|ARIRANG|TIMEFOLIO|WON|UNICORN|마이티|파워|FOCUS|히어로즈|BNK|KTOP)([[:space:]]|$)|우선주|[0-9]?우B?$)' THEN
    RAISE EXCEPTION 'excluded KR product cannot be inserted: %', NEW.code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
