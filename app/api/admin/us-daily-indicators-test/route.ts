import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function currentKstDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()).replaceAll("-", "");
}

const activeRuns = new Map<string, Promise<Record<string, unknown>>>();

async function executeUnified(breakoutLimit: number | undefined, mode: "summary" | "full"): Promise<Record<string, unknown>> {
  const startedAt = new Date().toISOString();
  const timings: Record<string, number> = {};
  async function settle<T>(name: string, task: Promise<T>) {
    const stageStartedAt = performance.now();
    try {
      return { ok: true, data: await task } as const;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) } as const;
    } finally {
      timings[name] = Math.round(performance.now() - stageStartedAt);
    }
  }

  // Warm the complete shared daily-candle cache before running any module.
  // The breakout limit only controls its result set; warming just that slice
  // would force MFI/DMI/MACD/OBV to issue their own heavyweight full-table
  // PostgreSQL queries on the small OCI instance.
  const context = await createUsDailyScanContext({ candleLimit: 100 });
  timings.context = context.timings.totalMs;
  timings.contextUniverse = context.timings.universeMs;
  timings.contextCandles = context.timings.candlesMs;
  const dailyBreakout = await settle("dailyBreakout", runUsDailyBreakoutScan({ limit: breakoutLimit, context }));
  const [mfi, dmi, macd, obv] = await Promise.all([
    settle("mfi", scanStoredUsMfiOversold({ context })),
    settle("dmi", scanStoredUsDmi({ context })),
    settle("macd", scanStoredUsMacd({ context })),
    settle("obv", scanStoredUsDailyObv({ context })),
  ]);
  const fullResults = { dailyBreakout, mfi, dmi, macd, obv };
  const summarize = (result: { ok: boolean; data?: any; error?: string }) => {
    if (!result.ok) return result;
    const data = result.data as Record<string, any>;
    const rows = Array.isArray(data.results) ? data.results : [];
    const qualified = Array.isArray(data.qualified) ? data.qualified.map((item: any) => ({ market: item.market, code: item.code, name: item.name })) : [];
    const { results: _rows, ...rest } = data;
    return { ok: true as const, data: { ...rest, qualified, resultCount: rows.length } };
  };
  const results = mode === "summary" ? Object.fromEntries(Object.entries(fullResults).map(([key, value]) => [key, summarize(value)])) : fullResults;
  const ok = Object.values(results).every((result) => result.ok);
  const candleRows = [...context.candles.values()].reduce((total, candles) => total + candles.length, 0);
  const candleMissingCount = context.universe.scopes.filter((item) => !context.candles.has(`${item.market}:${item.code}`)).length;

  return {
    ok,
    checkedAt: new Date().toISOString(),
    startedAt,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - Date.parse(startedAt),
    mode,
    timings,
    cache: { universeCount: context.universe.scopes.length, candleRows, candleMissingCount, candleLimit: context.candleLimit },
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
  };
}

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const limitValue = Number(params.get("breakoutLimit") || "");
  const breakoutLimit = Number.isFinite(limitValue) && limitValue > 0 ? Math.min(Math.floor(limitValue), 1000) : undefined;
  const mode = params.get("mode") === "summary" ? "summary" : "full";
  const key = `${mode}:${breakoutLimit ?? "all"}`;
  let run = activeRuns.get(key);
  if (!run) {
    run = executeUnified(breakoutLimit, mode).finally(() => {
      if (activeRuns.get(key) === run) activeRuns.delete(key);
    });
    activeRuns.set(key, run);
  }
  return NextResponse.json(await run);
}
