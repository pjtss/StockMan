import type { CandidateLifecycle } from "@/lib/intraday-memory-state";

export type IntradayObservation = { sourceObservedAt: number | null; receivedAt: number; sessionId: string | null; currentPrice: number | null; volume: number | null; tradingValue: number | null; vwap: number | null; aboveVwap: boolean | null };
export type QualityPolicy = { maxAgeSeconds: number; requiredConsecutiveObservations: number; expectedSessionId?: string | null };
export type QualityResult = { state: CandidateLifecycle; qualified: boolean; dataAgeSeconds: number | null; reasons: string[] };

/** A candidate cannot qualify without a fresh, session-matching and complete observation. */
export function evaluateIntradayQuality(observation: IntradayObservation, consecutiveObservations: number, now = Date.now(), policy: QualityPolicy = { maxAgeSeconds: 60, requiredConsecutiveObservations: 2 }): QualityResult {
  const reasons: string[] = [];
  const ageSeconds = observation.sourceObservedAt == null ? null : Math.max(0, (now - observation.sourceObservedAt) / 1000);
  if (observation.sourceObservedAt == null) reasons.push("SOURCE_TIME_MISSING");
  if (ageSeconds != null && ageSeconds > policy.maxAgeSeconds) reasons.push("STALE");
  if (policy.expectedSessionId && observation.sessionId !== policy.expectedSessionId) reasons.push("SESSION_MISMATCH");
  if (!(observation.currentPrice != null && observation.currentPrice > 0)) reasons.push("PRICE_MISSING");
  if (!(observation.volume != null && observation.volume > 0)) reasons.push("VOLUME_MISSING");
  if (!(observation.tradingValue != null && observation.tradingValue >= 0)) reasons.push("TRADING_VALUE_MISSING");
  if (!(observation.vwap != null && observation.vwap > 0)) reasons.push("VWAP_MISSING");
  if (consecutiveObservations < policy.requiredConsecutiveObservations) reasons.push("REPEAT_OBSERVATION_REQUIRED");
  if (reasons.includes("STALE") || reasons.includes("SESSION_MISMATCH")) return { state: reasons.includes("STALE") ? "STALE" : "DEGRADED", qualified: false, dataAgeSeconds: ageSeconds, reasons };
  if (reasons.length) return { state: consecutiveObservations === 0 ? "WARMING_UP" : "CONFIRMED", qualified: false, dataAgeSeconds: ageSeconds, reasons };
  return { state: "QUALIFIED", qualified: true, dataAgeSeconds: ageSeconds, reasons: ["FRESH", "SESSION_MATCH", "REPEATED_OBSERVATION", observation.aboveVwap ? "ABOVE_VWAP" : "VWAP_NOT_CONFIRMED"] };
}
