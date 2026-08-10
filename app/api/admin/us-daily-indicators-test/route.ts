import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentKstDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");
}

async function settle<T>(task: Promise<T>) {
  try {
    return { ok: true, data: await task } as const;
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) } as const;
  }
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const startedAt = new Date().toISOString();
  const params = new URL(request.url).searchParams;
  const limitValue = Number(params.get("breakoutLimit") || "");
  const breakoutLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 1000) : undefined;

  const [dailyBreakout, mfi, dmi, macd, obv] = await Promise.all([
    settle(runUsDailyBreakoutScan({ limit: breakoutLimit })),
    settle(scanStoredUsMfiOversold()),
    settle(scanStoredUsDmi()),
    settle(scanStoredUsMacd()),
    settle(scanStoredUsDailyObv()),
  ]);
  const results = { dailyBreakout, mfi, dmi, macd, obv };
  const ok = Object.values(results).every((result) => result.ok);

  return NextResponse.json({
    ok,
    checkedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(startedAt),
    dataPolicy: {
      source: "us_daily_price_candles",
      storage: "PostgreSQL DB cache",
      kstToday: currentKstDate(),
      cacheRefreshExcludesToday: true,
      historicalIndicators: ["mfi", "dmi", "macd", "obv"],
      historicalIndicatorRule: "MFI·DMI·MACD·일봉 OBV는 DB에 저장된 일봉만 사용하며 KIS 실시간 보충 조회를 하지 않습니다.",
      breakoutRule: "일봉 돌파는 DB에 저장된 당일 시가와 이전 5거래일 고가를 비교합니다. 당일 시가가 DB에 없으면 해당 종목은 실패로 기록됩니다.",
      breakoutLimit: breakoutLimit ?? "all",
    },
    results,
  });
}
