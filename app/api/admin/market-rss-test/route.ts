import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss, fetchMarketRssSource, MARKET_RSS_SOURCES, type MarketRssSource } from "@/lib/market-rss-sources";
import { translateMarketRssItems } from "@/lib/translate-market-rss-item";
import { previewMarketRssResults } from "@/lib/market-rss-preview";
import { describeError } from "@/lib/error-diagnostics";

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
  const params = new URL(request.url).searchParams;
  const source = params.get("source")?.toUpperCase();
  const translate = params.get("translate") === "true";
  const mode = (params.get("mode") || "FETCH_ONLY").toUpperCase();
  if (mode !== "FETCH_ONLY" && mode !== "PREVIEW") return NextResponse.json({ ok: false, error: "mode는 FETCH_ONLY 또는 PREVIEW만 지원합니다. 실제 저장·전송은 cron COMMIT 경로를 사용합니다." }, { status: 400 });
  if (source && !MARKET_RSS_SOURCES.includes(source as MarketRssSource)) return NextResponse.json({ error: "지원하지 않는 RSS source", sources: MARKET_RSS_SOURCES }, { status: 400 });
  try {
    if (!source) {
      const result = await fetchAllMarketRss();
      if (mode === "FETCH_ONLY" && !translate) return NextResponse.json({ ...result, mode });
      const results = mode === "PREVIEW"
        ? await previewMarketRssResults(result.results, translate)
        : await translateResultsSequentially(result);
      return NextResponse.json({ ...result, mode, results });
    }
    const feed = await fetchMarketRssSource(source as MarketRssSource);
    if (mode === "FETCH_ONLY") return NextResponse.json({ fetchedAt: new Date().toISOString(), source, ok: true, mode, translate, feed: await withTranslation(feed, translate) });
    const [preview] = await previewMarketRssResults([{ source, ok: true, feed }], translate);
    return NextResponse.json({ ...preview, fetchedAt: new Date().toISOString(), mode, translate });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ fetchedAt: new Date().toISOString(), source: source || null, mode, ok: false, stage: mode === "PREVIEW" && translate ? "translation" : "fetch", ...diagnostics }, { status: 502 });
  }
}
