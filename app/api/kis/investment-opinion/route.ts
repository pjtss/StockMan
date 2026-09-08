import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchInvestmentOpinion } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

function yyyymmdd(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const endDate = url.searchParams.get("endDate") ?? yyyymmdd(new Date());
  const startDate = url.searchParams.get("startDate") ?? yyyymmdd(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
  const collectedAt = new Date().toISOString();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "INVALID_STOCK_CODE", collectedAt }, { status: 400 });
  if (!/^\d{8}$/.test(startDate) || !/^\d{8}$/.test(endDate)) return NextResponse.json({ ok: false, error: "INVALID_DATE", collectedAt }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", code, collectedAt }, { status: 503 });
  try {
    const result = await fetchInvestmentOpinion(token, code, startDate, endDate);
    await writeKisSignalSnapshot({ market: "KR", code, signalType: "investment_opinion", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: result.rows });
    return NextResponse.json({ ok: result.ok, source: "KIS", market: "KR", code, startDate, endDate, collectedAt, rows: result.rows, diagnostics: { status: result.status, rtCd: result.rtCd, msgCd: result.msgCd, msg1: result.msg1 } }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market: "KR", code, startDate, endDate, collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
