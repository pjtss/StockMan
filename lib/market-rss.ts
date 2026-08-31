import { XMLParser } from "fast-xml-parser";

export type MarketRssItem = { id: string; title: string; link: string; summary: string; content?: string; publishedAt: string | null; source: string; raw?: unknown };
export type MarketRssFeed = {
  source: string;
  url: string;
  fetchedAt: string;
  items: MarketRssItem[];
  /** The exact response body returned by the publisher feed. */
  rawPayload?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true, processEntities: false });
const text = (value: unknown) => typeof value === "string" ? value.trim() : value && typeof value === "object" && "#text" in value ? String((value as Record<string, unknown>)["#text"]).trim() : "";
const array = <T>(value: T | T[] | undefined) => value == null ? [] : Array.isArray(value) ? value : [value];

export function parseMarketRss(xml: string, source: string, url: string): MarketRssFeed {
  const root = parser.parse(xml) as Record<string, unknown>;
  const channel = (root.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  const atom = root.feed as Record<string, unknown> | undefined;
  const entries = channel ? array(channel.item) : array(atom?.entry);
  const items = entries.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const linkValue = item.link;
    const link = typeof linkValue === "string" ? linkValue : linkValue && typeof linkValue === "object" ? String((linkValue as Record<string, unknown>).href || "") : "";
    const title = text(item.title);
    if (!title) return [];
    const publishedAt = text(item.pubDate || item.published || item.updated) || null;
    const id = text(item.guid || item.id) || `${source}:${publishedAt || "unknown"}:${index}`;
    const content = text(item.content);
    return [{ id, title, link, summary: text(item.description || item.summary || content), ...(content ? { content } : {}), publishedAt, source, raw }];
  });
  return { source, url, fetchedAt: new Date().toISOString(), items };
}

export async function fetchMarketRss(source: string, url: string, init: RequestInit = {}): Promise<MarketRssFeed> {
  const response = await fetch(url, { ...init, headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", ...(init.headers || {}) }, cache: "no-store" });
  if (!response.ok) throw new Error(`${source} RSS 요청 실패: ${response.status}`);
  const rawPayload = await response.text();
  return {
    ...parseMarketRss(rawPayload, source, url),
    rawPayload,
    responseStatus: response.status,
    responseHeaders: Object.fromEntries(response.headers.entries()),
  };
}
