import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchInvestorProgramTradeToday, fetchProgramTradeDailyMarket, fetchProgramTradeToday } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") ?? "today";
  if (!["today", "daily", "investor-today"].includes(mode)) return NextResponse.json({ ok: false, error: "INVALID_MODE" }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR" }, { status: 503 });
  const result = mode === "daily"
    ? await fetchProgramTradeDailyMarket(token, url.searchParams.get("startDate") ?? "", url.searchParams.get("endDate") ?? "", url.searchParams.get("market") ?? "J", url.searchParams.get("marketClass") ?? "K")
    : mode === "investor-today"
      ? await fetchInvestorProgramTradeToday(token, url.searchParams.get("marketClass") ?? "1")
      : await fetchProgramTradeToday(token, url.searchParams.get("market") ?? "J", url.searchParams.get("marketClass") ?? "K", url.searchParams.get("section") ?? "", url.searchParams.get("code") ?? "", url.searchParams.get("marketDiv") ?? "", url.searchParams.get("hour") ?? "");
  await writeKisSignalSnapshot({ market: "KR", code: "MARKET", signalType: `program_${mode}`, status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
  return NextResponse.json({ ...result, source: "KIS", market: "KR", mode, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
}
