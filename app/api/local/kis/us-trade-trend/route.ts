import { NextResponse } from "next/server";
import { fetchKisUsTradeTrend } from "@/lib/kis-us-trade-trend";

export const dynamic = "force-dynamic";

const tickerPattern = /^[A-Z0-9][A-Z0-9./_-]{0,31}$/;

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const params = new URL(request.url).searchParams;
  const code = (params.get("ticker") ?? params.get("code") ?? "").trim().toUpperCase();
  const dayValue = params.get("day") ?? "1";
  if (!tickerPattern.test(code)) {
    return NextResponse.json({ ok: false, error: "INVALID_TICKER", expected: "ticker=AAPL" }, { status: 400 });
  }
  if (dayValue !== "0" && dayValue !== "1") {
    return NextResponse.json({ ok: false, error: "INVALID_DAY", expected: "0|1" }, { status: 400 });
  }

  try {
    const result = await fetchKisUsTradeTrend({
      code,
      day: dayValue,
      marketPriority: ["NAS", "NYS", "AMS"],
    });
    if (!result) {
      return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE" }, { status: 503 });
    }

    return NextResponse.json({
      ok: result.ok,
      source: "KIS",
      code: result.code,
      exchange: result.market,
      day: result.day,
      fallbackOrder: ["NAS", "NYS", "AMS"],
      rows: result.trades,
      diagnostics: result.diagnostics,
      collectedAt: new Date().toISOString(),
    }, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error("[local KIS US trade trend] request failed:", error instanceof Error ? error.message.slice(0, 500) : "unknown error");
    return NextResponse.json({ ok: false, error: "KIS_US_TRADE_TREND_UNAVAILABLE" }, { status: 502 });
  }
}
