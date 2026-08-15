import { fetchFinraComposite } from "@/lib/finra-short-composite";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { getUsFreeFloat } from "@/lib/us-free-float";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(x) ? x : null; };
export function calculateSqueezeScore(input: { siFloat: number | null; pnl: number | null; daysToCover: number | null; shortVolumeRatio?: number | null }) {
  let score = 0, maxScore = 0;
  if (input.siFloat != null) { maxScore += 15; if (input.siFloat >= 30) score += 15; else if (input.siFloat >= 20) score += 12; else if (input.siFloat >= 10) score += 8; }
  if (input.pnl != null) { maxScore += 20; if (input.pnl <= -20) score += 20; else if (input.pnl <= -10) score += 15; else if (input.pnl <= -5) score += 8; }
  if (input.daysToCover != null) { maxScore += 10; if (input.daysToCover >= 5) score += 10; else if (input.daysToCover >= 3) score += 6; }
  if (input.shortVolumeRatio != null) { maxScore += 15; if (input.shortVolumeRatio >= 0.5) score += 15; else if (input.shortVolumeRatio >= 0.3) score += 10; else if (input.shortVolumeRatio >= 0.2) score += 5; }
  return { score, maxScore, coveragePercent: maxScore ? score / maxScore * 100 : 0 };
}
export async function analyzeUsShortSqueeze(rawTicker: string) {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error("INVALID_TICKER");
  const scopes = await Promise.race([
    loadStoredUsInstrumentScopes(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("UNIVERSE_TIMEOUT")), 5_000)),
  ]).catch((error) => { throw error; });
  const instrument = scopes.scopes.find((x) => x.code.toUpperCase() === ticker);
  if (!instrument) return { ok: false, ticker, error: "TICKER_NOT_IN_ACTIVE_US_UNIVERSE" };
  const bounded = <T>(promise: Promise<T>, fallback: T, timeoutMs = 9_000) => Promise.race([promise.catch(() => fallback), new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))]);
  const emptyShort = { metric: { ticker, shortInterest: null, shortVolume: null, totalVolume: null, shortVolumeRatio: null, daysToCover: null, asOf: null, source: "FINRA", status: "UNAVAILABLE" }, shortInterestStatus: "TIMEOUT", thresholdStatus: "TIMEOUT" } as unknown as Awaited<ReturnType<typeof fetchFinraComposite>>;
  const emptyFloat = { ok: false, ticker, floatShares: null, outstandingShares: null, freeFloatPercent: null, asOf: null, source: "SEC", dataType: "FREE_FLOAT", status: 0, error: "FLOAT_PROVIDER_TIMEOUT" } as Awaited<ReturnType<typeof getUsFreeFloat>>;
  const [short, float, price] = await Promise.all([
    bounded(fetchFinraComposite(ticker), emptyShort),
    bounded(getUsFreeFloat(ticker, instrument.market), emptyFloat),
    bounded(fetchKisUsPriceDetail({ code: ticker, market: instrument.market }), null),
  ]);
  const output = getKisUsPriceDetailOutput(price?.parsed);
  const currentPrice = n(output.last ?? output.t_xprc ?? output.price);
  const si = short.metric.shortInterest;
  const avgVolume = short.metric.averageDailyVolume;
  const daysToCover = short.metric.daysToCover ?? (si != null && avgVolume ? si / avgVolume : null);
  const floatShares = float.floatShares;
  const siFloat = si != null && floatShares ? si / floatShares * 100 : null;
  // FINRA Reg SHO provides aggregate volume, not execution prices. Do not
  // fabricate a cost basis from the current quote.
  const costBasis = null;
  const pnl = costBasis && currentPrice ? (costBasis - currentPrice) / costBasis * 100 : null;
  const scoreResult = calculateSqueezeScore({ siFloat, pnl, daysToCover, shortVolumeRatio: short.metric.shortVolumeRatio });
  const score = scoreResult.score;
  const grade = score >= 90 ? "EXTREME" : score >= 75 ? "VERY_HIGH" : score >= 60 ? "HIGH" : score >= 40 ? "WATCH" : "LOW";
  const state = score >= 75 && (pnl == null || pnl < 0) ? "SQUEEZE_READY" : score >= 40 ? "WATCH" : "NORMAL";
  const dataConfidence = si != null && floatShares != null && currentPrice != null ? (short.shortInterestStatus === "OK" && float.ok && price?.ok ? "A" : "B") : si != null ? "C" : "D";
  return { ok: true, ticker, market: instrument.market, instrument, currentPrice, estimatedShortCostBasis: costBasis, estimatedShortPnlPercent: pnl, shortInterest: si, float: floatShares, shortInterestFloatPercent: siFloat, floatSource: float.source, floatDataType: float.dataType, floatAsOf: float.asOf, shortInterestAsOf: short.metric.shortInterestAsOf, shortVolume: short.metric.shortVolume, shortVolumeRatio: short.metric.shortVolumeRatio, shortInterestSource: short.metric.source, shortInterestStatus: short.shortInterestStatus, fallbackUsed: Boolean(short.fallback?.ok), squeezeScore: score, maxAvailableScore: scoreResult.maxScore, scoreCoveragePercent: scoreResult.coveragePercent, squeezeGrade: grade, squeezeState: state, dataConfidence, estimated: true, sources: { finra: short, float, kisPrice: price }, limitations: ["공개 데이터 기반 추정값입니다.", "FINRA 무료 데이터에는 가격별 Short Sale 체결가가 없어 숏 원가·손익은 산출하지 않습니다.", "개별 숏 포지션 진입가와 실제 강제청산 가격은 확인할 수 없습니다."] };
}
