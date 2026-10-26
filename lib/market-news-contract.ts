export const MARKET_NEWS_SOURCES = [
  { id: "SEC_EDGAR", label: "SEC EDGAR" },
  { id: "NASDAQ", label: "NASDAQ" },
  { id: "NASDAQ_TRADER", label: "NASDAQ Trader" },
  { id: "STOCKTITAN", label: "StockTitan" },
  { id: "GLOBENEWSWIRE", label: "GlobeNewswire" },
] as const;

export type MarketNewsSource = typeof MARKET_NEWS_SOURCES[number]["id"];
export type MarketNewsKind = "ALL" | "NEWS" | "FILING";

export function isMarketNewsSource(value: string): value is MarketNewsSource {
  return MARKET_NEWS_SOURCES.some((source) => source.id === value);
}

export function marketNewsSourceLabel(source: string) {
  return MARKET_NEWS_SOURCES.find((item) => item.id === source)?.label ?? source;
}
