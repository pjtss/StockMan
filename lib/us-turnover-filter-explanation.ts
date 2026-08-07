import type { UsTurnoverFilterSettings } from "@/lib/us-turnover-settings";
import type { UsTurnoverRatioItem } from "@/lib/us-turnover-ratio";

export type TurnoverFilterExplanation = { passed: boolean; passedFilters: string[]; failedFilters: string[] };

export function explainUsTurnoverFilters(item: UsTurnoverRatioItem, settings: UsTurnoverFilterSettings): TurnoverFilterExplanation {
  const passedFilters: string[] = [];
  const failedFilters: string[] = [];
  const check = (condition: boolean, passed: string, failed: string) => (condition ? passedFilters.push(passed) : failedFilters.push(failed));
  const rate = Number.parseFloat(item.changeRate);
  check(Number.isFinite(rate) && rate >= 0, "등락률 0% 이상", `등락률 ${item.changeRate}%가 0% 미만`);
  check(item.openToHighRate <= settings.maxOpenToHighRate, `시가 대비 고점 ${item.openToHighRate.toFixed(2)}%`, `시가 대비 고점 ${item.openToHighRate.toFixed(2)}%가 상한 초과`);
  const effectiveMinMarketCap = Math.max(settings.minMarketCap, settings.globalMinMarketCap || 0);
  const effectiveMaxMarketCap = settings.globalMaxMarketCap > 0 ? Math.min(settings.maxMarketCap, settings.globalMaxMarketCap) : settings.maxMarketCap;
  check(item.marketCap >= effectiveMinMarketCap && item.marketCap <= effectiveMaxMarketCap, "시가총액 범위", "시가총액 범위 이탈");
  check(item.turnoverRatio >= settings.minTurnoverRatio && item.turnoverRatio <= settings.maxTurnoverRatio, `시총 대비 거래대금 ${item.turnoverRatio.toFixed(2)}%`, `시총 대비 거래대금 ${item.turnoverRatio.toFixed(2)}%가 범위 이탈`);
  return { passed: failedFilters.length === 0, passedFilters, failedFilters };
}
