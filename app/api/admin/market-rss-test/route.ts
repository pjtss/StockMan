import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss, fetchMarketRssSource, MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = new URL(request.url).searchParams.get("source")?.toUpperCase();
  if (!source) return NextResponse.json(await fetchAllMarketRss());
  if (!MARKET_RSS_SOURCES.includes(source as MarketRssSource)) return NextResponse.json({ error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  try { return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: true, feed: await fetchMarketRssSource(source as MarketRssSource) }); }
  catch (error) { return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
