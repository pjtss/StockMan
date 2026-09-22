import { NextResponse } from "next/server";
import { listInvestmentCalendarEvents } from "@/lib/investment-calendar";

export const dynamic = "force-dynamic";

function date(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = date(url.searchParams.get("from"), today);
  const to = date(url.searchParams.get("to"), new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10));
  const market = (url.searchParams.get("market") || "KR").toUpperCase();
  if (from > to) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
  if (market === "US") {
    return NextResponse.json({ ok: true, market, from, to, sourceAvailable: false, source: null, items: [], count: 0, message: "미국 상장 일정 공식 데이터 원천이 아직 연결되지 않았습니다." });
  }
  if (market !== "KR") return NextResponse.json({ ok: false, error: "UNSUPPORTED_MARKET" }, { status: 400 });
  try {
    const items = await listInvestmentCalendarEvents({ from, to, type: "IPO", market: "KR", limit: Number(url.searchParams.get("limit") || 200) });
    return NextResponse.json({ ok: true, market, from, to, sourceAvailable: true, source: "KRX_KIND", items, count: items.length, message: "KRX KIND RSS에서 수집·저장된 신규상장 관련 일정입니다." });
  } catch (error) {
    return NextResponse.json({ ok: false, market, from, to, error: error instanceof Error ? error.message : "LISTING_QUERY_FAILED" }, { status: 503 });
  }
}
