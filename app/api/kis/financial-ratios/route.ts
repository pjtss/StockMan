import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchFinancialRatio, fetchGrowthRatio, fetchProfitRatio, fetchStabilityRatio, fetchBalanceSheet, fetchIncomeStatement, fetchOtherMajorRatios } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";
const TYPES = ["financial", "growth", "profit", "stability", "balance-sheet", "income-statement", "other-major"] as const;
type RatioType = typeof TYPES[number];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const codes = [...new Set((url.searchParams.get("codes") ?? url.searchParams.get("code") ?? "").split(",").map((value) => value.trim()).filter(Boolean))].slice(0, 50);
  const code = codes[0] ?? "";
  const type = (url.searchParams.get("type") ?? "financial") as RatioType;
  const period = url.searchParams.get("period") === "quarter" ? "quarter" : "annual";
  const collectedAt = new Date().toISOString();
  if (!codes.length || codes.some((value) => !/^\d{6}$/.test(value))) return NextResponse.json({ ok: false, error: "INVALID_STOCK_CODE", collectedAt }, { status: 400 });
  if (!TYPES.includes(type)) return NextResponse.json({ ok: false, error: "INVALID_RATIO_TYPE", types: TYPES, collectedAt }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", code, type, collectedAt }, { status: 503 });
  try {
    const items = [];
    for (const currentCode of codes) {
      const result = type === "growth" ? await fetchGrowthRatio(token, currentCode, period) : type === "profit" ? await fetchProfitRatio(token, currentCode, period) : type === "stability" ? await fetchStabilityRatio(token, currentCode, period) : type === "balance-sheet" ? await fetchBalanceSheet(token, currentCode, period) : type === "income-statement" ? await fetchIncomeStatement(token, currentCode, period) : type === "other-major" ? await fetchOtherMajorRatios(token, currentCode, period) : await fetchFinancialRatio(token, currentCode, period);
      await writeKisSignalSnapshot({ market: "KR", code: currentCode, signalType: `ratio_${type}_${period}`, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", observedAt: new Date(collectedAt), payload: result.rows });
      items.push({ ok: result.ok, source: "KIS", market: "KR", code: currentCode, type, period, collectedAt, rows: result.rows, diagnostics: { status: result.status, rtCd: result.rtCd, msgCd: result.msgCd, msg1: result.msg1 } });
    }
    if (codes.length === 1) return NextResponse.json(items[0], { status: items[0].ok ? 200 : 502 });
    return NextResponse.json({ ok: items.every((item) => item.ok), source: "KIS", market: "KR", codes, type, period, collectedAt, items }, { status: items.some((item) => item.ok) ? 200 : 502 });
  } catch (error) {
    return NextResponse.json({ ok: false, source: "KIS", market: "KR", code, type, period, collectedAt, error: error instanceof Error ? error.message.slice(0, 500) : "KIS_REQUEST_FAILED" }, { status: 502 });
  }
}
