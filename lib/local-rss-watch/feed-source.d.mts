export const DEFAULT_ORIGINAL_RSS_FEEDS: Array<{ source: "STOCKTITAN" | "SEC_EDGAR"; url: string }>;
export class OriginalRssHttpError extends Error {
  source: string;
  status: number;
  retryAfter: string | null;
  constructor(source: string, status: number, retryAfter?: string | null);
}
export function fetchOriginalRssFeed(
  feed: { source: "STOCKTITAN" | "SEC_EDGAR"; url: string },
  options?: { fetchImpl?: typeof fetch; userAgent?: string; timeoutMs?: number },
): Promise<{
  source: string;
  url: string;
  fetchedAt: string;
  items: Array<{ id: string; title: string; link: string; summary: string; publishedAt: string | null; source: string }>;
  responseStatus: number;
}>;
