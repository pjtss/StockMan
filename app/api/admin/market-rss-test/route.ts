import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss, fetchMarketRssSource, MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";
import { translateMarketRssItems } from "@/lib/translate-market-rss-item";

const withTranslation = async (feed: Awaited<ReturnType<typeof fetchMarketRssSource>>, translate: boolean) =>
  translate ? { ...feed, items: await translateMarketRssItems(feed.items) } : feed;

async function translateResultsSequentially(result: Awaited<ReturnType<typeof fetchAllMarketRss>>) {
  const results = [];
  for (const item of result.results) {
    results.push(item.ok ? { ...item, feed: await withTranslation(item.feed, true) } : item);
  }
  return results;
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(request.url).searchParams.get("source")?.toUpperCase();
  const translate = new URL(request.url).searchParams.get("translate") === "true";
  if (!source) {
    const result = await fetchAllMarketRss();
    if (!translate) return NextResponse.json(result);
    return NextResponse.json({ ...result, results: await translateResultsSequentially(result) });
  }
  if (!MARKET_RSS_SOURCES.includes(source as MarketRssSource)) return NextResponse.json({ error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  try {
    const feed = await fetchMarketRssSource(source as MarketRssSource);
    return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: true, translate, feed: await withTranslation(feed, translate) });
  }
  catch (error) { return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
