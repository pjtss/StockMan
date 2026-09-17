import { NextResponse } from "next/server";
import { INTRADAY_MVP_POLICY, intradayMemoryState } from "@/lib/intraday-memory-state";
import { getIntradayWorkerSnapshot } from "@/lib/intraday-detection-worker";
import { isDomesticScannerOpen, isUsScannerOpen } from "@/lib/scanner-hours";

export const dynamic = "force-dynamic";

/** Returns only live TOP100 candidates that passed the MVP five-minute gate. */
export async function GET() {
  const snapshot = intradayMemoryState.snapshot();
  const [domesticOpen, usOpen] = await Promise.all([
    isDomesticScannerOpen(),
    isUsScannerOpen(),
  ]);
  const currentTop100 = new Set(snapshot.current.map((item) => `${item.market}:${item.code}`));
  const rollingByKey = new Map(snapshot.rollingTurnover.map((entry) => [entry.key, entry]));
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
      sampleCount: rollingByKey.get(`${candidate.market}:${candidate.code}`)?.buckets.length ?? 0,
      state: candidate.state ?? null,
      lastObservedAt: candidate.lastObservedAt ?? null,
    }));

  const worker = getIntradayWorkerSnapshot();
  const tracked = snapshot.candidates.filter((candidate) => candidate.mvpTracking).length;
  const qualified = snapshot.candidates.filter((candidate) => candidate.mvpTracking && candidate.mvpQualified).length;
  const sessionOpen = domesticOpen || usOpen;
  const detectionEnabled = process.env.INTRADAY_DETECTION_ENABLED === "true";
  const statusReason = items.length > 0
    ? "QUALIFIED"
    : tracked === 0
      ? "NO_TOP100"
      : !detectionEnabled
        ? "DISABLED"
        : worker.status === "STOPPED" && !sessionOpen
          ? "OUTSIDE_SESSION"
          : worker.status === "STOPPED"
            ? "STOPPED"
        : "OBSERVING";
  const statusMessage = items.length > 0 ? `${items.length}개 종목이 5분 거래대금 조건을 충족했습니다.` : tracked === 0 ? "현재 TOP100 후보를 수집하지 못했습니다. 장중 여부와 KIS 응답, 워커 상태를 확인하세요." : `TOP100 후보 ${tracked}개를 관측 중입니다. 종목별 최소 ${INTRADAY_MVP_POLICY.requiredSamples}개 1분 샘플과 최근 ${INTRADAY_MVP_POLICY.windowMs / 60_000}분 누적 거래대금 ${INTRADAY_MVP_POLICY.threshold * 100}% 조건이 아직 충족되지 않았습니다.`;
  return NextResponse.json({
    ok: true,
    mode: "INTRADAY_MVP_TURNOVER",
    collectedAt: new Date().toISOString(),
    criteria: { source: "TOP100_RISING", windowMinutes: INTRADAY_MVP_POLICY.windowMs / 60_000, requiredSamples: INTRADAY_MVP_POLICY.requiredSamples, minTurnoverToMarketCapRatio: INTRADAY_MVP_POLICY.threshold, bucketMinutes: INTRADAY_MVP_POLICY.bucketMs / 60_000, marketCapSource: "KIS_FIXED" },
    status: { worker, reason: statusReason, top100CandidateCount: snapshot.current.length, trackedCandidateCount: tracked, qualifiedCandidateCount: qualified, message: statusMessage },
    items,
  });
}
