import { NextResponse } from "next/server";
import { safeErrorMetadata } from "@/lib/error-diagnostics";
import { listInvestmentCalendarEvents } from "@/lib/investment-calendar";
import { boundedIntegerQuery } from "@/lib/query-params";
import { isValidCalendarDate } from "@/lib/calendar-date";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  if ((fromParam !== null && !isValidCalendarDate(fromParam)) || (toParam !== null && !isValidCalendarDate(toParam))) {
    return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE", expected: "YYYY-MM-DD calendar dates" }, { status: 400 });
  }
  const from = fromParam ?? today;
  const to = toParam ?? new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const market = (url.searchParams.get("market") || "KR").toUpperCase();
  if (from > to) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
  if (market === "US") {
    return NextResponse.json({ ok: true, market, from, to, sourceAvailable: false, source: null, items: [], count: 0, message: "미국 상장 일정 공식 데이터 원천이 아직 연결되지 않았습니다." });
  }
  if (market !== "KR") return NextResponse.json({ ok: false, error: "UNSUPPORTED_MARKET" }, { status: 400 });
  try {
    const limit = boundedIntegerQuery(url.searchParams.get("limit"), 200, 1, 1000);
    const items = await listInvestmentCalendarEvents({ from, to, type: "IPO", market: "KR", limit });
    return NextResponse.json({ ok: true, market, from, to, sourceAvailable: true, source: "KRX_KIND", items, count: items.length, message: "KRX KIND RSS에서 수집·저장된 신규상장 관련 일정입니다." });
  } catch (error) {
    return NextResponse.json({ ok: false, market, from, to, error: safeErrorMetadata(error).errorCode }, { status: 503 });
  }
}
