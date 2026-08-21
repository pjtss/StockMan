/**
 * 볼린저밴드 하단 이탈 후 재터치 판정 공통 모듈.
 *
 * 이전 봉(lookback 이내)에서 종가가 하단선 아래로 이탈했고,
 * 최신 봉 종가가 하단선 위로 복귀하면서 허용 오차 안에 있으면 반등 후보다.
 */
export type BollingerReboundPoint = { close: number; lower: number };

export type BollingerReboundPolicy = {
  enabled: boolean;
  lookback: number;
  tolerancePercent: number;
};

export type BollingerReboundState = "RETOUCH_AFTER_BREAKOUT" | "BREAKOUT_BELOW" | "NO_REBOUND";

export function detectBollingerRebound(points: BollingerReboundPoint[], policy: BollingerReboundPolicy) {
  const rows = points.filter((point) => Number.isFinite(point.close) && Number.isFinite(point.lower) && point.lower > 0);
  const latest = rows.at(-1);
  if (!latest) return { state: "NO_REBOUND" as const, qualifies: false, breakoutIndex: null, retestDistancePercent: null };
  const start = Math.max(0, rows.length - 1 - Math.max(1, Math.floor(policy.lookback)));
  const breakoutIndex = rows.slice(start, -1).reduce<number | null>((found, point, index) => point.close < point.lower ? start + index : found, null);
  const distancePercent = ((latest.close - latest.lower) / Math.abs(latest.lower)) * 100;
  const retouched = latest.close >= latest.lower && distancePercent <= Math.max(0, policy.tolerancePercent);
  const qualifies = policy.enabled ? breakoutIndex !== null && retouched : false;
  return {
    state: qualifies ? "RETOUCH_AFTER_BREAKOUT" as const : latest.close < latest.lower ? "BREAKOUT_BELOW" as const : "NO_REBOUND" as const,
    qualifies,
    breakoutIndex,
    retestDistancePercent: Number(distancePercent.toFixed(4)),
  };
}
