import { NextResponse } from "next/server";
import { listStockmanCollectionStatus, listStockmanEvents, renderStockmanEventsMarkdown } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";
const ALLOWED_HOURS = new Set([1, 12, 24, 168]);
const REPORT_TYPES = new Set(["bullish", "daily", "ticker", "dilution", "collection"]);

function dateStartKst(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : new Date(date.getTime() - 9 * 60 * 60_000);
}

function currentKstDate(now: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

async function collectItems(options: Parameters<typeof listStockmanEvents>[0]) {
  const items: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;
  while (hasMore && page <= 100) {
    const result = await listStockmanEvents({ ...options, page, pageSize: 500 });
    items.push(...result.items as Array<Record<string, unknown>>);
    hasMore = result.hasMore;
    page++;
  }
  return { items, truncated: hasMore };
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const type = (params.get("type") ?? "bullish").toLowerCase();
  if (!REPORT_TYPES.has(type)) return NextResponse.json({ ok: false, error: "INVALID_REPORT_TYPE", allowed: [...REPORT_TYPES] }, { status: 400 });
  const hoursParam = params.get("hours");
  const hours = hoursParam === null ? (type === "daily" ? 24 : type === "bullish" ? 12 : null) : Number(hoursParam);
  if (hours !== null && (!Number.isInteger(hours) || !ALLOWED_HOURS.has(hours))) return NextResponse.json({ ok: false, error: "INVALID_HOURS", allowed: [...ALLOWED_HOURS] }, { status: 400 });
  const now = new Date();

  try {
    if (type === "collection") {
      const sources = await listStockmanCollectionStatus();
      const markdown = ["# Stockman 수집 상태 보고서", "", `- 기준 시각: ${new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium" }).format(now)} KST`, "", ...sources.map((source) => `- ${source.moduleKey}: ${source.status} (source=${source.sourceStatus}, ledger=${source.eventLedgerStatus})`)].join("\n");
      return NextResponse.json({ ok: true, reportType: "COLLECTION_STATUS", asOf: now.toISOString(), timezone: "Asia/Seoul", count: sources.length, markdown, items: sources }, { headers: { "Cache-Control": "no-store" } });
    }

    const ticker = (params.get("ticker") ?? "").trim().toUpperCase();
    if (type === "ticker" && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return NextResponse.json({ ok: false, error: "TICKER_REQUIRED_OR_INVALID" }, { status: 400 });
    if (type !== "ticker" && params.has("ticker")) return NextResponse.json({ ok: false, error: "TICKER_FILTER_REQUIRES_TICKER_REPORT" }, { status: 400 });

    let query: Parameters<typeof listStockmanEvents>[0] = { sort: type === "ticker" ? "latest" : "importance" };
    if (type === "bullish") query = { ...query, hours: hours ?? 12, asOf: now, positiveOnly: true };
    if (type === "daily") {
      const dateValue = params.get("date") ?? currentKstDate(now);
      const from = dateStartKst(dateValue);
      if (!from) return NextResponse.json({ ok: false, error: "INVALID_REPORT_DATE" }, { status: 400 });
      query = { ...query, from, to: new Date(from.getTime() + 24 * 60 * 60_000 - 1), positiveOnly: true };
    }
    if (type === "ticker") query = { ...query, ticker, ...(hours === null ? {} : { hours, asOf: now }) };
    if (type === "dilution") query = { ...query, hours, asOf: now, dilutionOnly: true };
    const { items, truncated } = await collectItems(query);
    const markdown = renderStockmanEventsMarkdown(items, now).replace("# Stockman 최근 호재 보고서", `# Stockman ${({ bullish: "호재", daily: "일간 호재", ticker: `${ticker} 종목 이력`, dilution: "희석 위험" } as Record<string, string>)[type] ?? "호재"} 보고서`);
    return NextResponse.json({ ok: true, reportType: type.toUpperCase(), ...(hours === null ? {} : { hours }), ...(type === "daily" ? { date: params.get("date") ?? currentKstDate(now) } : {}), ...(type === "ticker" ? { ticker } : {}), asOf: now.toISOString(), timezone: "Asia/Seoul", count: items.length, truncated, markdown, items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "REPORT_UNAVAILABLE" }, { status: 503 });
  }
}
