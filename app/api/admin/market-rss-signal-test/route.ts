import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss } from "@/lib/market-rss-sources";
import { analyzeMarketNews } from "@/lib/market-news-signal";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fetched = await fetchAllMarketRss();
  const results = fetched.results.map((result) => {
    if (!result.ok) return { source: result.source, ok: false, error: result.error, itemCount: 0, positiveCount: 0, candidates: [] };
    const analyzed = result.feed.items.map((item) => ({ item, signal: analyzeMarketNews(item) }));
    const positive = analyzed.filter(({ signal }) => signal.direction === "POSITIVE").sort((a, b) => b.signal.score - a.signal.score);
    const categoryCounts = analyzed.reduce<Record<string, number>>((counts, { signal }) => { counts[signal.category] = (counts[signal.category] || 0) + 1; return counts; }, {});
    const directionCounts = analyzed.reduce<Record<string, number>>((counts, { signal }) => { counts[signal.direction] = (counts[signal.direction] || 0) + 1; return counts; }, {});
    return { source: result.source, ok: true, itemCount: analyzed.length, positiveCount: positive.length, categoryCounts, directionCounts, candidates: positive.slice(0, 20) };
  });
  return NextResponse.json({ ok: true, fetchedAt: fetched.fetchedAt, totalPositiveCount: results.reduce((sum, result) => sum + result.positiveCount, 0), results });
}
