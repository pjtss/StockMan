import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/kis-token";
import { fetchInvestorDailyByMarket, fetchInvestorTimeByMarket } from "@/lib/kis-investor-flow";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "daily" ? "daily" : "time";
  const date = url.searchParams.get("date")?.trim();
  if (mode === "daily" && (!date || !/^\d{8}$/.test(date))) return NextResponse.json({ ok: false, error: "INVALID_DATE", expected: "YYYYMMDD" }, { status: 400 });
  const token = await getAccessToken();
  if (!token) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market: "KR" }, { status: 503 });
  const result = mode === "daily"
    ? await fetchInvestorDailyByMarket(token, date!)
    : await fetchInvestorTimeByMarket(token, url.searchParams.get("marketCode") ?? "999", url.searchParams.get("sectorCode") ?? "S001");
  await writeKisSignalSnapshot({ market: "KR", code: "MARKET", signalType: mode === "daily" ? "market_investor_daily" : "market_investor_time", status: result.ok ? "AVAILABLE" : "UNAVAILABLE", payload: result.rows });
  return NextResponse.json({ ...result, source: "KIS", market: "KR", mode, collectedAt: new Date().toISOString() }, { status: result.ok ? 200 : 502 });
}
