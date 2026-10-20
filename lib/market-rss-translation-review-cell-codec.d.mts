export type MarketRssReviewCellKind = "externalId" | "ticker" | "publishedAt";
export function encodeMarketRssReviewCell(kind: MarketRssReviewCellKind, value: string | null | undefined): string;
export function decodeMarketRssReviewCell(kind: MarketRssReviewCellKind, value: string): string;
