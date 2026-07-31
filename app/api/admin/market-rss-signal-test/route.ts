import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss } from "@/lib/market-rss-sources";
import { analyzeMarketNews } from "@/lib/market-news-signal";
import { fetchSecRssBody } from "@/lib/sec-rss-body";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fetched = await fetchAllMarketRss();
  const resolveBodies = new URL(request.url).searchParams.get("resolveSec") === "true";
  const bodyLimit = Math.max(0, Number(process.env.SEC_SIGNAL_BODY_LIMIT || 5));
  let bodyAttempts = 0;
  let bodySuccesses = 0;
  const bodyErrors: string[] = [];
  const secBodyCandidates: Array<{ item: unknown; signal: ReturnType<typeof analyzeMarketNews>; formType: string; itemSections: string[] }> = [];
  const results = fetched.results.map((result) => {
    if (!result.ok) return { source: result.source, ok: false, error: result.error, itemCount: 0, positiveCount: 0, candidates: [] };
    const analyzed = result.feed.items.map((item) => ({ item, signal: analyzeMarketNews(item) }));
    const positive = analyzed.filter(({ signal }) => signal.direction === "POSITIVE").sort((a, b) => b.signal.score - a.signal.score);
    const categoryCounts = analyzed.reduce<Record<string, number>>((counts, { signal }) => { counts[signal.category] = (counts[signal.category] || 0) + 1; return counts; }, {});
    const directionCounts = analyzed.reduce<Record<string, number>>((counts, { signal }) => { counts[signal.direction] = (counts[signal.direction] || 0) + 1; return counts; }, {});
    return { source: result.source, ok: true, itemCount: analyzed.length, positiveCount: positive.length, categoryCounts, directionCounts, candidates: positive.slice(0, 20) };
  });
  if (resolveBodies) {
    const sec = fetched.results.find((result) => result.ok && result.source === "SEC_EDGAR");
    if (sec?.ok) {
      for (const item of sec.feed.items.filter((item) => /\b8-K\b|FORM 8-K/i.test(item.title)).slice(0, bodyLimit)) {
        bodyAttempts++;
        try {
          const body = await fetchSecRssBody(item);
          const signal = analyzeMarketNews({ ...item, summary: `${item.summary}\n${body.text}` });
          secBodyCandidates.push({ item, signal, formType: body.formType, itemSections: body.itemSections });
          bodySuccesses++;
        } catch (error) { bodyErrors.push(error instanceof Error ? error.message : String(error)); }
      }
    }
  }
  return NextResponse.json({ ok: true, fetchedAt: fetched.fetchedAt, totalPositiveCount: results.reduce((sum, result) => sum + result.positiveCount, 0), secBody: { enabled: resolveBodies, attempts: bodyAttempts, successes: bodySuccesses, errors: bodyErrors, candidates: secBodyCandidates.filter(({ signal }) => signal.direction === "POSITIVE").sort((a, b) => b.signal.score - a.signal.score).slice(0, 20) }, results });
}
