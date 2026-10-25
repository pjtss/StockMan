const UPPERCASE_WORDS_TO_TRANSLATE = new Set([
  "A", "AN", "AND", "ARE", "AS", "AT", "BE", "BEEN", "BEING", "BUT", "BY",
  "ADDS", "AFTER", "ANNOUNCE", "ANNOUNCES", "ANNOUNCED", "AWARDS", "BEGINS", "BUYBACKS",
  "CALL", "CALLS", "CLOSES", "COMPLETES", "CUTS", "DECLARES", "DURING", "EFFECTIVE",
  "ENDS", "ENTERS", "EXPECTS", "EXTENDS", "FILES", "FILED", "FINAL", "FIRST", "FOURTH",
  "FULL", "GETS", "GROWTH", "GUIDANCE", "HIGHEST", "HITS", "HOTTEST", "INCREASES",
  "INTERIM", "LAUNCHES", "LATEST", "LEADS", "MAJOR", "MARKET", "METALS", "MILESTONE",
  "MILESTONES", "NEXT", "OFFERS", "ONGOING", "OPENS", "OUTLOOK", "PARTNERS", "PERIOD",
  "PHASE", "PLANS", "POSTS", "PROJECT", "PROPOSES", "RAISES", "REPORT", "REPORTS",
  "RESULTS", "REVENUE", "RISES", "SCHEDULE", "SCHEDULES", "SECOND", "SETS", "SHARES",
  "SIGNS", "SUSPENDS", "THIRD", "TOP", "TRADING", "TRANSFER", "TRIAL", "UPDATE",
  "UPDATES", "VOLUME", "WINS", "YEAR", "YEARS", "ZIP", "ZIPS",
  "FOR", "FROM", "HAS", "HAVE", "HE", "HER", "HIS", "IF", "IN", "INTO",
  "IS", "IT", "ITS", "MAY", "NEAR", "NOT", "OF", "ON", "OR", "OUT", "OVER",
  "SHE", "SO", "THE", "THEIR", "THEN", "THERE", "THEY", "THIS", "THROUGH",
  "TO", "UNDER", "UP", "WAS", "WE", "WERE", "WHAT", "WHEN", "WHICH", "WHO",
  "WHY", "WILL", "WITH", "YOU",
]);

const NUMBER_VALUE = String.raw`(?:\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?|\d{1,3}(?:[.,'’ \u00a0\u202f]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)`;
const MAGNITUDE_SUFFIX = String.raw`(?:(?:bps?|[Mm]illion|[Bb]illion|[Tt]rillion|[Mm]n|[Bb]n|[Tt]n)(?!\p{L})|[kKmMbBtTxX](?!\p{L}))`;
const FINANCIAL_AMOUNT = String.raw`(?:(?:[+\-−﹣－](?:[$€£¥]\s*)?)|(?:[$€£¥]\s*)?[+\-−﹣－]?)?${NUMBER_VALUE}(?:\s?(?:%|${MAGNITUDE_SUFFIX}))?(?:\s?[$€£¥])?`;
const FINANCIAL_RANGE = String.raw`(?:${FINANCIAL_AMOUNT}(?:\s*[-–—]\s*${FINANCIAL_AMOUNT})?)`;
const FINANCIAL_VALUE = String.raw`(?:\(${FINANCIAL_RANGE}\)|${FINANCIAL_RANGE})`;
const PROTECTABLE_TOKEN = new RegExp(
  String.raw`\b(?:PD-L\d+|\d{1,2}-[A-Z]{1,2}(?:/A)?|S-[1-9](?:/A)?|F-[1-9](?:/A)?|424B[1-9])\b|\b(?=[A-Z][A-Z0-9-]*\d)[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b|(?<![\p{L}\p{N}_])[1-4][a-cA-C]?(?:\s*/\s*[1-4][a-cA-C]?)?상(?![\p{L}\p{N}_])|\$[A-Z]{1,5}(?:[.-][A-Z]{1,2})?|\bQ[1-4]\b|\b[A-Z]{1,5}(?:[.-][A-Z]{1,2})+\b|${FINANCIAL_VALUE}(?:\s*[-–—]\s*${FINANCIAL_VALUE})?|\b[A-Z]{2,6}\b`,
  "gu",
);

export function transformMarketRssProtectedTokens(text, transform) {
  const tokens = [];
  const transformed = text.replace(PROTECTABLE_TOKEN, (token, offset) => {
    if (/^[A-Z]{1,6}$/.test(token)) {
      const before = text.slice(0, offset);
      const after = text.slice(offset + token.length);
      // Publisher ticker suffixes and parenthesized symbols are identifiers,
      // even when they happen to be English words such as TOP or ZIP.
      if (/\|\s*$/.test(before) && /^\s+Stock\s+News\b/i.test(after)) return transformToken(token);
      if (before.endsWith("(") && after.startsWith(")")) return transformToken(token);
    }
    if (/^[A-Z]+$/.test(token) && UPPERCASE_WORDS_TO_TRANSLATE.has(token)) return token;
    const index = tokens.length;
    tokens.push(token);
    return transform(token, index);
  });
  return { text: transformed, tokens };

  function transformToken(token) {
    const index = tokens.length;
    tokens.push(token);
    return transform(token, index);
  }
}

export function extractMarketRssProtectedTokens(text) {
  return transformMarketRssProtectedTokens(text, (token) => token).tokens;
}
