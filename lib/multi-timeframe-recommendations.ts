import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { queryEligibleUniverse } from "@/lib/instrument-eligibility";
import { writeKisCache } from "@/lib/kis-cache";
import { analyzeTechnicalEntry } from "@/lib/technical-entry-analysis";
import { evaluateDayTradeSignal, type DayTradeCandle } from "@/lib/daytrade-signal";

type Mode = "scalp" | "swing" | "all";
type Candle = DayTradeCandle & { updatedAt: string | null };
const ema = (values: number[], period: number) => { if (!values.length) return null; const k = 2 / (period + 1); let out = values[0]; for (const value of values.slice(1)) out = value * k + out * (1 - k); return out; };
const bb = (values: number[]) => { if (values.length < 20) return null; const w = values.slice(-20); const mid = w.reduce((a, b) => a + b, 0) / w.length; const sd = Math.sqrt(w.reduce((a, b) => a + (b - mid) ** 2, 0) / w.length); return { mid, lower: mid - 2 * sd, upper: mid + 2 * sd }; };
const avg = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
const signal = (values: number[], period = 20) => ema(values, period);
export const calculateDayTradeFlowState = (rows: Candle[]) => {
  let obv = 0, adl = 0;
  const obvs: number[] = [], adls: number[] = [];
  rows.forEach((row, index) => { if (index && row.close !== rows[index - 1].close) obv += row.volume * Math.sign(row.close - rows[index - 1].close); if (index) { const range = row.high - row.low; adl += range > 0 ? row.volume * ((row.close - row.low) - (row.high - row.close)) / range : 0; } obvs.push(obv); adls.push(adl); });
  const obvSignal = signal(obvs), adlSignal = signal(adls);
  return { obv: obvs.at(-1) ?? null, obvSignal: obvSignal ?? 0, adl: adls.at(-1) ?? null, adlSignal: adlSignal ?? 0, obvAboveSignal: (obvs.at(-1) ?? 0) > (obvSignal ?? 0), adlAboveSignal: (adls.at(-1) ?? 0) > (adlSignal ?? 0) };
};
export const latestCompletedDailyDate = (groups: Iterable<{ D: Candle[] }>) => [...groups].flatMap((item) => item.D.map((row) => row.date)).sort().at(-1) ?? null;

export async function recommendMultiTimeframe(market: "KR" | "US", mode: Mode = "all", limit = 30) {
  const candlesTable = market === "KR" ? "kr_instrument_universe_candles" : "us_instrument_universe_candles";
  const universeTable = market === "KR" ? "kr_common_stock_universe" : "us_common_stock_universe";
  const db = getDb();
  const eligibility = await queryEligibleUniverse(db, market);
  const scopes = { rows: eligibility.rows };
  const timeframeFilter = mode === "scalp" ? "c.timeframe = 'D'" : "c.timeframe IN ('D','W','M')";
  const candles = await db.execute(sql.raw(`WITH ranked_candles AS (SELECT c.market, c.code, c.timeframe, c.candle_date AS date, c.open, c.high, c.low, c.close, c.volume, c.fetched_at AS "updatedAt", ROW_NUMBER() OVER (PARTITION BY c.market, c.code, c.timeframe ORDER BY c.candle_date DESC, c.fetched_at DESC) AS rn FROM ${candlesTable} c JOIN ${universeTable} u ON u.market = c.market AND u.code = c.code WHERE ${timeframeFilter} AND c.close IS NOT NULL AND u.enabled = true AND u.daily_active = true AND u.instrument_type = 'COMMON_STOCK' ${market === "KR" ? "AND COALESCE(u.is_suspended, false) = false AND COALESCE(u.trading_halt_code, '') NOT IN ('Y','1') AND COALESCE(u.liquidation_code, '') NOT IN ('Y','1') AND COALESCE(u.managed_issue_code, '') <> 'Y'" : "AND COALESCE(u.is_etf, false) = false AND COALESCE(u.is_warrant, false) = false AND COALESCE(u.is_derivative, false) = false AND COALESCE(u.is_dr, false) = false AND COALESCE(u.is_leveraged, false) = false AND COALESCE(u.is_inverse, false) = false"}) SELECT market, code, timeframe, date, open, high, low, close, volume, "updatedAt" FROM ranked_candles WHERE (timeframe = 'D' AND rn <= 140) OR (timeframe IN ('W','M') AND rn <= 30) ORDER BY market, code, timeframe, date`));
  let fundamentals = new Map<string, any>();
  try {
    const rows = await db.execute(sql.raw(`SELECT market, code, price, trading_value AS "tradingValue", market_cap AS "marketCap", volume, fetched_at AS "fetchedAt" FROM instrument_fundamental_snapshots WHERE market = '${market}'`));
    for (const row of rows.rows as any[]) fundamentals.set(`${row.market}:${row.code}`, row);
  } catch { /* fundamentals are an enhancement; candle-only scoring remains available during migration */ }
  const grouped = new Map<string, { D: Candle[]; W: Candle[]; M: Candle[] }>();
  for (const row of candles.rows as any[]) { const key = `${row.market}:${row.code}`; const item = grouped.get(key) ?? { D: [], W: [], M: [] }; item[row.timeframe as "D" | "W" | "M"].push({ date: String(row.date), open: Number(row.open ?? row.close), high: Number(row.high ?? row.close), low: Number(row.low ?? row.close), close: Number(row.close), volume: Number(row.volume ?? 0), updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null }); grouped.set(key, item); }
  const latestDailyDate = latestCompletedDailyDate(grouped.values());
  const results = (scopes.rows as any[])
    .map((scope) => {
      const g = grouped.get(`${scope.market}:${scope.code}`);
      if (!g || g.D.length < 20 || (mode !== "scalp" && (g.W.length < 20 || g.M.length < 20))) return null;
      const f = fundamentals.get(`${scope.market}:${scope.code}`);
      const d = g.D;
      const w = g.W;
      const m = g.M;
      const dc = d.at(-1)!;
      const wc = w.at(-1) ?? null;
      const mc = m.at(-1) ?? null;
      if (!Number.isFinite(dc.volume) || dc.volume <= 0) return null;
      if (latestDailyDate !== null && dc.date !== latestDailyDate) return null;

      const technical = analyzeTechnicalEntry(d);
      const dbb = bb(d.map((x) => x.close))!;
      const wbb = bb(w.map((x) => x.close));
      const mbb = bb(m.map((x) => x.close));
      const dE9 = ema(d.map((x) => x.close), 9)!;
      const dE20 = ema(d.map((x) => x.close), 20)!;
      const wE9 = w.length ? ema(w.map((x) => x.close), 9)! : null;
      const wE20 = w.length ? ema(w.map((x) => x.close), 20)! : null;
      const flow = calculateDayTradeFlowState(d);
      const dVol = avg(d.slice(-20).map((x) => x.volume)) ?? 0;
      const volRatio = dVol > 0 ? dc.volume / dVol : 0;
      const tradingValue = Number(f?.tradingValue ?? 0);
      const marketCap = Number(f?.marketCap ?? 0);
      const valuePerCap = marketCap > 0 ? tradingValue / marketCap : 0;
      const dayTrade = evaluateDayTradeSignal(d, { minRvol: 1 });
      if (mode === "scalp" && !dayTrade.qualifies) return null;

      const trend = (dc.close > dE9 ? 10 : 0) + (dE9 > dE20 ? 10 : 0) + (wc && wE9 && wE20 && wc.close > wE9 && wE9 > wE20 ? 15 : 0) + (mc && mbb && mc.close >= mbb.mid ? 10 : 0);
      const momentum = dc.close >= dbb.mid && dc.close <= dbb.upper ? 10 : dc.close > dbb.upper ? 5 : 0;
      const liquidity = volRatio >= 1.5 ? 15 : volRatio >= 1 ? 8 : 0;
      const turnover = valuePerCap >= 0.03 ? 10 : valuePerCap >= 0.01 ? 5 : 0;
      const pullback = dc.close <= dbb.mid && dc.close >= dbb.lower ? 10 : 0;
      const flowScore = flow.obvAboveSignal && flow.adlAboveSignal ? 10 : flow.obvAboveSignal || flow.adlAboveSignal ? 5 : 0;
      const score = mode === "scalp" ? trend + momentum + liquidity + turnover + flowScore : mode === "swing" ? trend + pullback + (mc && mbb && mc.close >= mbb.mid ? 10 : 0) + turnover + flowScore : trend + momentum + liquidity + pullback + turnover + flowScore;
      if (mode === "scalp" && liquidity === 0) return null;
      if (mode === "swing" && !(wc && wbb && mc && mbb && wc.close >= wbb.mid && mc.close >= mbb.mid)) return null;

      return {
        market: scope.market,
        code: scope.code,
        name: scope.name,
        score,
        dayTrade,
        technical,
        latest: { date: dc.date, updatedAt: dc.updatedAt, close: dc.close, volume: dc.volume },
        fundamentals: f ? { price: Number(f.price ?? dc.close), tradingValue, marketCap, fetchedAt: f.fetchedAt } : null,
        averages: { volume20: dVol, volumeRatio: volRatio, tradingValueToMarketCap: valuePerCap },
        trend: { dailyEma9: dE9, dailyEma20: dE20, weeklyEma9: wE9, weeklyEma20: wE20 },
        bollinger: { daily: dbb, weekly: wbb, monthly: mbb },
        flow,
        timeframeMeta: { daily: { date: dc.date, updatedAt: dc.updatedAt }, weekly: wc ? { date: wc.date, updatedAt: wc.updatedAt } : null, monthly: mc ? { date: mc.date, updatedAt: mc.updatedAt } : null },
        reasons: [trend >= 25 ? "다중 시간봉 상승 추세" : null, mode === "scalp" ? "단타 신호 조건 충족" : null, flowScore >= 5 ? "OBV·ADL 자금 흐름 양호" : null, liquidity >= 8 ? "일봉 거래량 증가" : null, turnover >= 5 ? "시총 대비 거래대금 양호" : null, momentum > 0 ? "일봉 BB 상단 접근" : null, pullback > 0 ? "일봉 눌림목" : null].filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(limit, 100)));
  const generatedAt = new Date().toISOString();
  const policy = { source: "*_instrument_universe_candles", timeframes: mode === "scalp" ? ["D"] : ["D", "W", "M"], maxResults: 100, eligibility: "official COMMON_STOCK/product/status filter", disclaimer: "기술적 조건 기반 후보이며 투자 수익을 보장하지 않음" };
  const output = { ok: true, market, mode, instrumentCount: scopes.rows.length, qualifiedCount: results.length, latestDailyDate, tickers: results.map((result: any) => result.code).join(","), results, policy, responseMeta: { generatedAt, generatedAtTimeZone: "Asia/Seoul", dataSource: "DB_CACHE_ONLY", signalBasis: "latest completed daily candle only; next session open required", executionKey: `technical-entry-analysis:${market}:${mode}` } };
  await writeKisCache(`technical-entry-analysis:${market}:${mode}`, output);
  return output;
}
