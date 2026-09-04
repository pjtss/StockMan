import { fetchMarketRss, type MarketRssFeed } from "./market-rss";

/**
 * 국내 출처별 RSS adapter.
 * URL은 제공자가 공개한 공식 RSS 주소만 환경변수로 등록한다.
 * 주소가 등록되지 않은 출처는 cron을 실패시키지 않고 SKIPPED feed를 반환한다.
 */
export const DOMESTIC_RSS_SOURCES = ["KRX_KIND", "NEWSIS", "MK", "HANKYUNG", "ETODAY"] as const;
export type DomesticRssSource = typeof DOMESTIC_RSS_SOURCES[number];

const envNames: Record<DomesticRssSource, string> = {
  KRX_KIND: "KRX_KIND_RSS_URL",
  NEWSIS: "NEWSIS_RSS_URL",
  MK: "MK_RSS_URL",
  HANKYUNG: "HANKYUNG_RSS_URL",
  ETODAY: "ETODAY_RSS_URL",
};

function emptyFeed(source: DomesticRssSource, url: string): MarketRssFeed {
  return { source, url, fetchedAt: new Date().toISOString(), items: [], rawPayload: "", responseStatus: 0 };
}

export function domesticRssConfig(source: DomesticRssSource) {
  const envName = envNames[source];
  const url = process.env[envName]?.trim() || "";
  return { source, envName, url, configured: Boolean(url) };
}

export async function fetchDomesticRss(source: DomesticRssSource): Promise<MarketRssFeed> {
  const { url } = domesticRssConfig(source);
  if (!url) return emptyFeed(source, "");
  return fetchMarketRss(source, url);
}

export async function fetchAllDomesticRss() {
  const results = await Promise.all(DOMESTIC_RSS_SOURCES.map(async (source) => {
    try {
      const feed = await fetchDomesticRss(source);
      return { source, ok: true as const, skipped: feed.responseStatus === 0, feed };
    } catch (error) {
      return { source, ok: false as const, skipped: false, error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return { fetchedAt: new Date().toISOString(), results };
}
