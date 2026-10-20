const UPPERCASE_WORDS_TO_TRANSLATE = new Set([
  "A", "AN", "AND", "ARE", "AS", "AT", "BE", "BEEN", "BEING", "BUT", "BY",
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
  String.raw`\$[A-Z]{1,5}(?:[.-][A-Z]{1,2})?|\bQ[1-4]\b|\b[A-Z]{1,5}(?:[.-][A-Z]{1,2})+\b|${FINANCIAL_VALUE}(?:\s*[-–—]\s*${FINANCIAL_VALUE})?|\b[A-Z]{2,6}\b`,
  "gu",
);

export function transformMarketRssProtectedTokens(text, transform) {
  const tokens = [];
  const transformed = text.replace(PROTECTABLE_TOKEN, (token) => {
    if (/^[A-Z]+$/.test(token) && UPPERCASE_WORDS_TO_TRANSLATE.has(token)) return token;
    const index = tokens.length;
    tokens.push(token);
    return transform(token, index);
  });
  return { text: transformed, tokens };
}

export function extractMarketRssProtectedTokens(text) {
  return transformMarketRssProtectedTokens(text, (token) => token).tokens;
}
