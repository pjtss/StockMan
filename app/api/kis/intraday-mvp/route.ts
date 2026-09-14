import { NextResponse } from "next/server";
import { INTRADAY_MVP_POLICY, intradayMemoryState } from "@/lib/intraday-memory-state";

export const dynamic = "force-dynamic";

/** Returns only live TOP100 candidates that passed the MVP five-minute gate. */
export async function GET() {
  const snapshot = intradayMemoryState.snapshot();
  const currentTop100 = new Set(snapshot.current.map((item) => `${item.market}:${item.code}`));
  const items = snapshot.candidates
    .filter((candidate) => candidate.mvpTracking && candidate.mvpQualified && currentTop100.has(`${candidate.market}:${candidate.code}`))
    .map((candidate) => ({
      market: candidate.market,
      code: candidate.code,
      marketCap: candidate.marketCap ?? null,
      rollingTradingValue: candidate.rollingTurnoverValue ?? 0,
      rollingTurnoverRatio: candidate.rollingTurnoverRatio ?? null,
      windowStart: candidate.turnoverWindowStart ?? null,
      windowEnd: candidate.turnoverWindowEnd ?? null,
      sampleCount: snapshot.rollingTurnover.find((entry) => entry.key === `${candidate.market}:${candidate.code}`)?.buckets.length ?? 0,
      state: candidate.state ?? null,
      lastObservedAt: candidate.lastObservedAt ?? null,
    }));

  return NextResponse.json({
    ok: true,
    mode: "INTRADAY_MVP_TURNOVER",
    collectedAt: new Date().toISOString(),
    criteria: { source: "TOP100_RISING", windowMinutes: INTRADAY_MVP_POLICY.windowMs / 60_000, requiredSamples: INTRADAY_MVP_POLICY.requiredSamples, minTurnoverToMarketCapRatio: INTRADAY_MVP_POLICY.threshold, bucketMinutes: INTRADAY_MVP_POLICY.bucketMs / 60_000, marketCapSource: "KIS_FIXED" },
    items,
  });
}
