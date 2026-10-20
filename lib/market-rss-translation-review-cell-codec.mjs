const PREFIX = {
  externalId: "RSS-ID:",
  ticker: "RSS-TICKER:",
  publishedAt: "RSS-TIME:",
};

export function encodeMarketRssReviewCell(kind, value) {
  if (value == null || value === "") return "";
  return `${PREFIX[kind]}${value}`;
}

export function decodeMarketRssReviewCell(kind, value) {
  const prefix = PREFIX[kind];
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}
