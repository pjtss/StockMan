import { fetchFinraComposite } from "@/lib/finra-short-composite";
import { fetchKisUsPriceDetail, getKisUsPriceDetailOutput } from "@/lib/kis-us-price-detail";
import { getUsFreeFloat } from "@/lib/us-free-float";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

const n = (v: unknown) => { const x = Number(String(v ?? "").replace(/,/g, "").replace(/%/g, "")); return Number.isFinite(x) ? x : null; };
export async function analyzeUsShortSqueeze(rawTicker: string) {
  const ticker = rawTicker.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) throw new Error("INVALID_TICKER");
  const scopes = await loadStoredUsInstrumentScopes();
  const instrument = scopes.scopes.find((x) => x.code.toUpperCase() === ticker);
  if (!instrument) return { ok: false, ticker, error: "TICKER_NOT_IN_ACTIVE_US_UNIVERSE" };
  const [short, float, price] = await Promise.all([fetchFinraComposite(ticker), getUsFreeFloat(ticker), fetchKisUsPriceDetail({ code: ticker, market: instrument.market })]);
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
  let score = 0; if ((siFloat ?? 0) >= 30) score += 15; else if ((siFloat ?? 0) >= 20) score += 12; else if ((siFloat ?? 0) >= 10) score += 8;
  if ((pnl ?? 0) <= -20) score += 20; else if ((pnl ?? 0) <= -10) score += 15; else if ((pnl ?? 0) <= -5) score += 8;
  if ((daysToCover ?? 0) >= 5) score += 10; else if ((daysToCover ?? 0) >= 3) score += 6;
  const grade = score >= 90 ? "EXTREME" : score >= 75 ? "VERY_HIGH" : score >= 60 ? "HIGH" : score >= 40 ? "WATCH" : "LOW";
  const state = score >= 75 && (pnl ?? 0) < 0 ? "SQUEEZE_READY" : score >= 40 ? "WATCH" : "NORMAL";
  const dataConfidence = si != null && floatShares != null && currentPrice != null ? (short.shortInterestStatus === "OK" && float.ok && price?.ok ? "A" : "B") : si != null ? "C" : "D";
  return { ok: true, ticker, market: instrument.market, instrument, currentPrice, estimatedShortCostBasis: costBasis, estimatedShortPnlPercent: pnl, shortInterest: si, float: floatShares, shortInterestFloatPercent: siFloat, daysToCover, shortInterestAsOf: short.metric.shortInterestAsOf, shortVolume: short.metric.shortVolume, shortVolumeRatio: short.metric.shortVolumeRatio, squeezeScore: score, squeezeGrade: grade, squeezeState: state, dataConfidence, estimated: true, sources: { finra: short, float, kisPrice: price }, limitations: ["공개 데이터 기반 추정값입니다.", "개별 숏 포지션 진입가와 실제 강제청산 가격은 확인할 수 없습니다."] };
}
