import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchFinancialRatio, fetchGrowthRatio, fetchProfitRatio, fetchStabilityRatio, fetchBalanceSheet, fetchIncomeStatement, fetchOtherMajorRatios } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";
const TYPES = ["financial", "growth", "profit", "stability", "balance-sheet", "income-statement", "other-major"] as const;
type RatioType = typeof TYPES[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = (url.searchParams.get("code") ?? "").trim();
  const type = (url.searchParams.get("type") ?? "financial") as RatioType;
  const period = url.searchParams.get("period") === "quarter" ? "quarter" : "annual";
  const collectedAt = new Date().toISOString();
  if (!/^\d{6}$/.test(code)) return NextResponse.json({ ok: false, error: "INVALID_STOCK_CODE", collectedAt }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, error: "INVALID_RATIO_TYPE", types: TYPES, collectedAt }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", code, type, collectedAt }, { status: 503 });
  try {
    const result = type === "growth" ? await fetchGrowthRatio(token, code, period) : type === "profit" ? await fetchProfitRatio(token, code, period) : type === "stability" ? await fetchStabilityRatio(token, code, period) : type === "balance-sheet" ? await fetchBalanceSheet(token, code, period) : type === "income-statement" ? await fetchIncomeStatement(token, code, period) : type === "other-major" ? await fetchOtherMajorRatios(token, code, period) : await fetchFinancialRatio(token, code, period);
    const signalType = `ratio_${type}_${period}`;
    await writeKisSignalSnapshot({ market: "KR", code, signalType, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: result.rows });
    return NextResponse.json({ ok: result.ok, source: "KIS", market: "KR", code, type, period, collectedAt, rows: result.rows, diagnostics: { status: result.status, rtCd: result.rtCd, msgCd: result.msgCd, msg1: result.msg1 } }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market: "KR", code, type, period, collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
