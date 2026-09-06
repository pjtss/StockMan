import { ACCUMULATION_POLICY, calculateAccumulationFeatures, explainAccumulationScore, validOhlcv, validTradingDate, type AccumulationCandle } from "./accumulation-screener-core";
import { createClosedCandleCheck, type AccumulationRegion } from "./accumulation-session";

export type AccumulationInstrument = {
  market: string; code: string; name: string; marketCap: number | null;
  sharesOutstanding: number | null; fundamentalUpdatedAt: string | null;
  candles: AccumulationCandle[];
};
export type AccumulationOptions = { limit?: number; minRvol?: number; minScore?: number; asOf?: Date };
export function normalizeAccumulationOptions(options: AccumulationOptions = {}) {
  const finite = (v: number | undefined, fallback: number) => v !== undefined && Number.isFinite(v) ? v : fallback;
  const asOf = options.asOf ?? new Date();
  if (!Number.isFinite(asOf.getTime())) throw new Error("INVALID_AS_OF");
  return {
    limit: Math.max(1, Math.min(1000, Math.trunc(finite(options.limit, 100)))),
    minRvol: Math.max(0, finite(options.minRvol, ACCUMULATION_POLICY.defaultMinRvol)),
    minScore: Math.max(0, Math.min(100, finite(options.minScore, ACCUMULATION_POLICY.defaultMinScore))),
    asOf,
  };
}

function toResult(instrument: AccumulationInstrument, candles: AccumulationCandle[], region: AccumulationRegion, minRvol: number) {
  const f = calculateAccumulationFeatures(candles), last = candles[candles.length - 1];
  const scoreBreakdown = explainAccumulationScore(f, minRvol);
  const score = scoreBreakdown.reduce((sum, reason) => sum + reason.points, 0);
  const usedCandles = candles.map(c => ({ date: c.date, tradingAt: c.tradingAt, updatedAt: c.updatedAt }));
  return {
    market: instrument.market, exchange: instrument.market, code: instrument.code, name: instrument.name,
    status: "ACTIVE", marketCap: instrument.marketCap, sharesOutstanding: instrument.sharesOutstanding,
    fundamentalUpdatedAt: instrument.fundamentalUpdatedAt, currency: region === "KR" ? "KRW" : "USD",
    logicVersion: ACCUMULATION_POLICY.version, candleDate: last.date, latestDate: last.date,
    candleFetchedAt: last.updatedAt, ...f, score, scoreBreakdown,
    turnoverRatio: instrument.marketCap && instrument.marketCap > 0 ? f.turnoverEma5 / instrument.marketCap : null,
    timeframeMeta: { daily: { date: last.date, tradingAt: last.tradingAt, updatedAt: last.updatedAt, usedCandles } },
    metrics: {
      "D.rvol": f.rvol, "D.obv.change20": f.obvChange20, "D.adl.change20": f.adlChange20,
      "D.close": last.close, "D.ema9": f.ema9, "D.ema20": f.ema20,
      "D.volume.balance5": f.volumeBalance, "D.volume.expansion5": f.volumeExpansion5,
      "D.down.volume.ratio5": f.downVolumeRatio, "D.price.range20": f.priceRange20,
      "D.atr.percent20": f.atrPercent, "D.atr.contraction": f.atrContraction,
      "D.volume.elevatedDays5": f.elevatedVolumeDays5, "D.absorption.ratio5": f.absorptionRatio5,
    },
  };
}
export type AccumulationResult = ReturnType<typeof toResult>;

/** One pure batch evaluator for both markets, including freshness and accounting. */
export function evaluateAccumulationScan(region: AccumulationRegion, instruments: AccumulationInstrument[], options: AccumulationOptions = {}) {
  const settings = normalizeAccumulationOptions(options), closed = createClosedCandleCheck(region, settings.asOf);
  const latestDateByMarket: Record<string, string> = {}, storedDateByMarket: Record<string, string> = {};
  let unusableBars = 0;
  for (const instrument of instruments) for (const c of instrument.candles) {
    if (validTradingDate(c.date) && c.date > (storedDateByMarket[instrument.market] ?? "")) storedDateByMarket[instrument.market] = c.date;
    if (!closed(c.date, c.updatedAt) || !validOhlcv(c) || c.volume <= 0) { unusableBars++; continue; }
    if (c.date > (latestDateByMarket[instrument.market] ?? "")) latestDateByMarket[instrument.market] = c.date;
  }
  const excluded: Record<string, number> = {};
  const reject = (reason: string) => { excluded[reason] = (excluded[reason] ?? 0) + 1; };
  const results: AccumulationResult[] = [];
  let evaluated = 0;
  for (const instrument of instruments) {
    if (region === "KR" && (instrument.marketCap === null || !Number.isFinite(instrument.marketCap) || instrument.marketCap <= 30000000000)) {
      reject("MARKET_CAP_TOO_SMALL_OR_UNKNOWN"); continue;
    }
    const anchor = latestDateByMarket[instrument.market];
    if (!instrument.candles.length) { reject("NO_HISTORY"); continue; }
    if (!anchor) { reject("NO_COMPLETED_MARKET_CACHE"); continue; }
    // Later placeholders are visible in storedDateByMarket; never silently called current data.
    const history = instrument.candles.filter(c => c.date <= anchor).slice(-ACCUMULATION_POLICY.historyBars);
    const last = history[history.length - 1];
    if (!last || last.date !== anchor) { reject("STALE_SYMBOL_DATE"); continue; }
    if (history.length < ACCUMULATION_POLICY.minimumBars) { reject("INSUFFICIENT_HISTORY"); continue; }
    if (history.some((c, i) => !validOhlcv(c) || !validTradingDate(c.date) || (i > 0 && c.date <= history[i - 1].date))) { reject("INVALID_CANDLES"); continue; }
    if (history.some(c => !closed(c.date, c.updatedAt))) { reject("INCOMPLETE_CANDLES"); continue; }
    if (last.volume <= 0) { reject("ZERO_LATEST_VOLUME"); continue; }
    let result: AccumulationResult;
    try { result = toResult(instrument, history, region, settings.minRvol); }
    catch (error) {
      if (error instanceof Error && ["ZERO_VOLUME_BASELINE", "NON_FINITE_FEATURE"].includes(error.message)) { reject(error.message); continue; }
      throw error;
    }
    evaluated++;
    if (!(result.obvChange20 > 0 && result.adlChange20 > 0 && result.rvol >= settings.minRvol)) { reject("SIGNAL_NOT_MET"); continue; }
    if (result.score < settings.minScore) { reject("BELOW_MIN_SCORE"); continue; }
    results.push(result);
  }
  results.sort((a, b) => b.score - a.score || b.rvol - a.rvol || a.market.localeCompare(b.market) || a.code.localeCompare(b.code));
  const selected = results.slice(0, settings.limit).map((row, index) => ({ ...row, rank: index + 1 }));
  const warnings = [
    "가격·거래량 기반 휴리스틱이며 실제 매집 또는 상승확률을 확인한 결과가 아닙니다.",
    "최신일은 적격 종목의 장마감 후 수집된 유효 캐시 기준이며 공식 최신 거래일을 보증하지 않습니다.",
    "정규장 종료시각 기준의 보수적 검증입니다. 휴장일·특별 거래시간·조기 폐장 달력은 별도 연동하지 않았습니다.",
    "DB 보통주 분류를 사용합니다. 해외 ADR·펀드 오분류 및 분할 조정 여부는 별도 검증되지 않았습니다.",
  ];
  if (Object.keys(storedDateByMarket).some(m => storedDateByMarket[m] > (latestDateByMarket[m] ?? ""))) warnings.push("유효 기준일보다 새로운 미완성·거래량 없는 캐시 행이 있습니다.");
  if (Object.values(latestDateByMarket).some(date => settings.asOf.getTime() - Date.parse(date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6) + "T00:00:00Z") > 7 * 86400000)) warnings.push("유효 캐시 기준일이 7일 이상 오래되었습니다.");
  return {
    ok: true as const, region, logicVersion: ACCUMULATION_POLICY.version, checkedAt: settings.asOf.toISOString(),
    source: "database_daily_cache", criteria: (region === "KR" ? "국내 활성 보통주·시총 300억 초과" : "해외 활성 보통주")
      + ", RVOL(전일 거래량 EMA20 대비) " + settings.minRvol + " 이상, OBV·ADL 20봉 증가, 최소 점수 " + settings.minScore,
    policy: { ...ACCUMULATION_POLICY, minRvol: settings.minRvol, minScore: settings.minScore, marketCapFloor: region === "KR" ? 30000000000 : null },
    cache: { latestDateByMarket, storedDateByMarket, unusableBars }, warnings,
    summary: { eligible: instruments.length, evaluated, matched: results.length, returned: selected.length,
      excluded: instruments.length - results.length, exclusions: excluded, truncated: results.length > selected.length },
    results: selected, count: selected.length, tickers: selected.map(x => x.code).join(","),
  };
}
export type AccumulationReport = ReturnType<typeof evaluateAccumulationScan>;
