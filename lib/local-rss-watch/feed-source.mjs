import { parseMarketRss } from "../market-rss.ts";

export const DEFAULT_ORIGINAL_RSS_FEEDS = [
  { source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" },
  { source: "SEC_EDGAR", url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=100&output=atom" },
];

const ACCEPT = "application/rss+xml, application/atom+xml, application/xml, text/xml";

export class OriginalRssHttpError extends Error {
  constructor(source, status, retryAfter = null) {
    super(`${source} 원본 RSS HTTP ${status}`);
    this.name = "OriginalRssHttpError";
    this.source = source;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

function assertOfficialSource(source, rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("원본 RSS는 HTTPS만 허용합니다.");
  const host = url.hostname.toLowerCase();
  const trusted = source === "STOCKTITAN"
    ? host === "stocktitan.net" || host.endsWith(".stocktitan.net")
    : source === "SEC_EDGAR" && (host === "sec.gov" || host.endsWith(".sec.gov"));
  if (!trusted) throw new Error(`${source} 원본 허용 도메인이 아닙니다.`);
  return url;
}

export async function fetchOriginalRssFeed(feed, {
  fetchImpl = fetch,
  userAgent = process.env.SEC_USER_AGENT,
  timeoutMs = 8_000,
} = {}) {
  const url = assertOfficialSource(feed.source, feed.url);
  const headers = { accept: ACCEPT };
  if (feed.source === "SEC_EDGAR") {
    const agent = String(userAgent || "").trim();
    if (!agent) throw new Error("SEC_USER_AGENT가 .env.local에 설정되지 않았습니다.");
    headers["user-agent"] = agent;
  }
  const response = await fetchImpl(url.href, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "follow",
  });
  if (!response.ok) throw new OriginalRssHttpError(feed.source, response.status, response.headers.get("retry-after"));
  if (response.url) assertOfficialSource(feed.source, response.url);
  const xml = await response.text();
  if (!xml.trim()) throw new Error(`${feed.source} 원본 RSS가 비어 있습니다.`);
  if (!/<(?:rss|feed)(?:\s|>)/i.test(xml)) throw new Error(`${feed.source} 응답이 RSS/Atom XML이 아닙니다.`);
  if (Buffer.byteLength(xml, "utf8") > 5_000_000) throw new Error(`${feed.source} 원본 RSS가 5MB 제한을 초과했습니다.`);
  const parsed = parseMarketRss(xml, feed.source, url.href);
  return { ...parsed, responseStatus: response.status };
}
