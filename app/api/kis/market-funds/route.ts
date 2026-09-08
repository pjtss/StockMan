import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchMarketFunds } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? "";
  const collectedAt = new Date().toISOString();
  if (date && !/^\d{8}$/.test(date)) return NextResponse.json({ ok: false, error: "INVALID_DATE", collectedAt }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", collectedAt }, { status: 503 });
  try {
    const result = await fetchMarketFunds(token, date);
    await writeKisSignalSnapshot({ market: "KR", code: "MARKET", signalType: "market_funds", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: result.rows });
    return NextResponse.json({ ok: result.ok, source: "KIS", market: "KR", code: "MARKET", signalType: "market_funds", date: date || null, collectedAt, rows: result.rows, diagnostics: { status: result.status, rtCd: result.rtCd, msgCd: result.msgCd, msg1: result.msg1 } }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market: "KR", signalType: "market_funds", collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
