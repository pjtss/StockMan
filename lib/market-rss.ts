import { XMLParser, XMLValidator } from "fast-xml-parser";
import { decodeXML } from "entities";
import { extractMarketRssCoreSummary } from "./market-rss-summary";

export type MarketRssItem = { id: string; title: string; link: string; summary: string; normalizedSummary?: string; content?: string; publishedAt: string | null; source: string; raw?: unknown };
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

export type MarketRssFetchStage = "request" | "timeout" | "http_status" | "response_body" | "parse";

export class MarketRssFetchError extends Error {
  constructor(
    readonly source: string,
    readonly stage: MarketRssFetchStage,
    readonly errorCode: string,
    readonly upstreamStatus?: number,
  ) {
    super(`${source} RSS ${errorCode}`);
    this.name = "MarketRssFetchError";
  }
}

export function getMarketRssFetchDiagnostics(error: unknown) {
  if (error instanceof MarketRssFetchError) {
    return {
      stage: error.stage,
      errorCode: error.errorCode,
      ...(error.upstreamStatus ? { upstreamStatus: error.upstreamStatus } : {}),
    };
  }
  return { stage: "request" as const, errorCode: "RSS_REQUEST_FAILED" };
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true, processEntities: false });
const text = (value: unknown) => typeof value === "string"
  ? decodeXML(value).trim()
  : value && typeof value === "object" && "#text" in value
    ? decodeXML(String((value as Record<string, unknown>)["#text"])).trim()
    : "";
const array = <T>(value: T | T[] | undefined) => value == null ? [] : Array.isArray(value) ? value : [value];

export function parseMarketRss(xml: string, source: string, url: string): MarketRssFeed {
  const validation = XMLValidator.validate(xml);
  if (validation !== true) {
    throw new Error(`${source} RSS 응답이 올바른 XML이 아닙니다.`);
  }
  const root = parser.parse(xml) as Record<string, unknown>;
  const channel = (root.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  const atom = root.feed as Record<string, unknown> | undefined;
  if (!channel && !atom) {
    throw new Error(`${source} 응답이 RSS 또는 Atom feed가 아닙니다.`);
  }
  if (root.rss && !channel) {
    throw new Error(`${source} RSS 응답에 channel이 없습니다.`);
  }
  const entries = channel ? array(channel.item) : array(atom?.entry);
  const items = entries.flatMap((raw, index) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as Record<string, unknown>;
    const linkValue = item.link;
    const link = typeof linkValue === "string"
      ? decodeXML(linkValue.trim())
      : linkValue && typeof linkValue === "object"
        ? decodeXML(String((linkValue as Record<string, unknown>).href || "").trim())
        : "";
    const title = text(item.title);
    if (!title) return [];
    const publishedAt = text(item.pubDate || item.published || item.updated) || null;
    const id = text(item.guid || item.id) || `${source}:${publishedAt || "unknown"}:${index}`;
    const content = text(item.content);
    const summary = text(item.description || item.summary || content);
    return [{ id, title, link, summary, normalizedSummary: extractMarketRssCoreSummary(summary, title), ...(content ? { content } : {}), publishedAt, source, raw }];
  });
  return { source, url, fetchedAt: new Date().toISOString(), items };
}

export async function fetchMarketRss(source: string, url: string, init: RequestInit = {}): Promise<MarketRssFeed> {
  const timeoutMs = Math.max(1_000, Number(process.env.RSS_FETCH_TIMEOUT_MS || 30_000));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: controller.signal, headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", ...(init.headers || {}) }, cache: "no-store" });
    } catch {
      if (controller.signal.aborted) throw new MarketRssFetchError(source, "timeout", "RSS_FETCH_TIMEOUT");
      throw new MarketRssFetchError(source, "request", "RSS_REQUEST_FAILED");
    }
    if (!response.ok) throw new MarketRssFetchError(source, "http_status", "RSS_HTTP_ERROR", response.status);
    let rawPayload: string;
    try {
      rawPayload = await response.text();
    } catch {
      if (controller.signal.aborted) throw new MarketRssFetchError(source, "timeout", "RSS_FETCH_TIMEOUT");
      throw new MarketRssFetchError(source, "response_body", "RSS_RESPONSE_BODY_FAILED", response.status);
    }
    let parsed: MarketRssFeed;
    try {
      parsed = parseMarketRss(rawPayload, source, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const errorCode = /올바른 XML이 아닙니다/.test(message)
        ? "RSS_XML_INVALID"
        : /RSS 또는 Atom feed가 아닙니다|channel이 없습니다/.test(message)
          ? "RSS_FEED_FORMAT_INVALID"
          : "RSS_PARSE_FAILED";
      throw new MarketRssFetchError(source, "parse", errorCode, response.status);
    }
    return {
      ...parsed,
      rawPayload,
      responseStatus: response.status,
      responseHeaders: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    if (error instanceof MarketRssFetchError) throw error;
    if (controller.signal.aborted) throw new MarketRssFetchError(source, "timeout", "RSS_FETCH_TIMEOUT");
    throw new MarketRssFetchError(source, "request", "RSS_REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
  }
}
