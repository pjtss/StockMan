import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchAllMarketRss } from "@/lib/market-rss-sources";
import { analyzeMarketNews } from "@/lib/market-news-signal";
import { fetchSecRssBody } from "@/lib/sec-rss-body";
import { extractSecCik, resolvePreferredSecCompanyTickers, resolveSecCompanyTickers } from "@/lib/sec-company-ticker";
import { resolveMarketNewsReactions } from "@/lib/market-news-market-reaction";
import { classifyMarketRssItem } from "@/lib/market-rss-classifier";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const fetched = await fetchAllMarketRss();
  const resolveBodies = new URL(request.url).searchParams.get("resolveSec") === "true";
  const bodyLimit = Math.max(0, Number(process.env.SEC_SIGNAL_BODY_LIMIT || 5));
  let bodyAttempts = 0;
  let bodySuccesses = 0;
  const bodyErrors: string[] = [];
  const secBodyCandidates: Array<{ item: unknown; signal: ReturnType<typeof analyzeMarketNews>; formType: string; itemSections: string[] }> = [];
  const secCiks = fetched.results.flatMap((result) => result.ok && result.source === "SEC_EDGAR" ? result.feed.items.map((item) => extractSecCik(item.title)).filter(Boolean) : []);
  let secTickers: Awaited<ReturnType<typeof resolveSecCompanyTickers>> = [];
  let preferredSecTickers: Awaited<ReturnType<typeof resolvePreferredSecCompanyTickers>> = [];
  const resolveTickers = new URL(request.url).searchParams.get("resolveTickers") !== "false";
  const resolveMarket = new URL(request.url).searchParams.get("resolveMarket") === "true";
  if (resolveTickers && secCiks.length) {
    try {
      secTickers = await resolveSecCompanyTickers(secCiks);
      preferredSecTickers = await resolvePreferredSecCompanyTickers(secCiks);
    } catch (error) { bodyErrors.push(error instanceof Error ? error.message : String(error)); }
  }
  const results = fetched.results.map((result) => {
    if (!result.ok) return { source: result.source, ok: false, error: result.error, itemCount: 0, positiveCount: 0, candidates: [] };
    const analyzed = result.feed.items.map((item) => {
      const signal = analyzeMarketNews(item);
      const classified = classifyMarketRssItem(item);
      const mappedTicker = result.source === "SEC_EDGAR" ? preferredSecTickers.find((row) => row.cik === extractSecCik(item.title))?.ticker : undefined;
      const tickers = [...new Set([...signal.tickers, ...(classified.ticker ? [classified.ticker] : []), ...(mappedTicker ? [mappedTicker] : [])])];
      return { item, signal: { ...signal, tickers }, tickerResolved: tickers.length > 0, reactionSkippedReason: tickers.length ? undefined : "ticker_unresolved" };
    });
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
          const baseSignal = analyzeMarketNews({ ...item, summary: `${item.summary}\n${body.text}` });
          const mappedTicker = preferredSecTickers.find((row) => row.cik === extractSecCik(item.title))?.ticker;
          const signal = { ...baseSignal, tickers: [...new Set([...baseSignal.tickers, ...(mappedTicker ? [mappedTicker] : [])])] };
          secBodyCandidates.push({ item, signal, formType: body.formType, itemSections: body.itemSections });
          bodySuccesses++;
        } catch (error) { bodyErrors.push(error instanceof Error ? error.message : String(error)); }
      }
    }
  }
  const marketCandidates = [...secBodyCandidates.filter(({ signal }) => signal.direction === "POSITIVE").map(({ item, signal }) => ({ item, signal, tickerResolved: signal.tickers.length > 0 })), ...results.flatMap((result) => result.ok ? result.candidates.filter(({ signal }) => signal.direction === "POSITIVE") : [])].filter(({ tickerResolved }) => tickerResolved).slice(0, Number(process.env.SEC_SIGNAL_MARKET_LIMIT || 5));
  const marketReactionSkippedReason = marketCandidates.length === 0 ? "no_positive_candidate_with_resolved_ticker" : undefined;
  const marketReactions = resolveMarket ? await resolveMarketNewsReactions(marketCandidates.map(({ item, signal }) => { const value = item as { title: string }; return { title: value.title, ticker: signal.tickers[0], cik: extractSecCik(value.title) }; }), preferredSecTickers, Number(process.env.SEC_SIGNAL_MARKET_LIMIT || 5)) : [];
  return NextResponse.json({ ok: true, fetchedAt: fetched.fetchedAt, totalPositiveCount: results.reduce((sum, result) => sum + result.positiveCount, 0), secTickers: { enabled: resolveTickers, mappedCount: secTickers.length, preferredMappedCount: preferredSecTickers.length, rows: secTickers, preferredRows: preferredSecTickers }, secBody: { enabled: resolveBodies, attempts: bodyAttempts, successes: bodySuccesses, errors: bodyErrors, candidates: secBodyCandidates.filter(({ signal }) => signal.direction === "POSITIVE").sort((a, b) => b.signal.score - a.signal.score).slice(0, 20) }, marketReaction: { enabled: resolveMarket, attempted: marketReactions.length, tickerResolved: marketCandidates.length, reactionSkippedReason: marketReactionSkippedReason, results: marketReactions }, results });
}
