import { getPool } from "./db";
import { ACCUMULATION_POLICY } from "./accumulation-screener-core";
import { cacheDateCutoff, type AccumulationRegion } from "./accumulation-session";
import type { AccumulationInstrument } from "./accumulation-scan";

export type AccumulationDbRow = {
  market: string; code: string; name: string; market_cap: number | string | null;
  shares_outstanding: number | string | null; fundamental_updated_at: Date | string | null;
  candle_date: string | null; candle_time: Date | string | null; fetched_at: Date | string | null;
  open: number | string | null; high: number | string | null; low: number | string | null;
  close: number | string | null; volume: number | string | null;
};
const tables = {
  KR: { universe: "kr_common_stock_universe", candles: "kr_instrument_universe_candles",
    markets: ["KOSPI", "KOSDAQ"], filter: "AND NOT u.is_etp AND NOT u.is_warrant AND NOT u.is_preferred AND NOT u.is_suspended AND f.market_cap > 30000000000" },
  US: { universe: "us_common_stock_universe", candles: "us_instrument_universe_candles",
    markets: ["NAS", "NYS", "AMS"], filter: "AND NOT u.is_etf AND NOT u.is_leveraged AND NOT u.is_inverse AND NOT u.is_warrant AND NOT u.is_derivative" },
} as const;
function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function numeric(value: number | string | null): number {
  return value === null || (typeof value === "string" && value.trim() === "") ? NaN : Number(value);
}
function nullablePositive(value: number | string | null): number | null {
  const number = numeric(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}
export function groupAccumulationRows(rows: AccumulationDbRow[]): AccumulationInstrument[] {
  const groups = new Map<string, AccumulationInstrument>();
  for (const row of rows) {
    const key = row.market + ":" + row.code;
    let instrument = groups.get(key);
    if (!instrument) {
      instrument = { market: row.market, code: row.code, name: row.name,
        marketCap: nullablePositive(row.market_cap), sharesOutstanding: nullablePositive(row.shares_outstanding),
        fundamentalUpdatedAt: timestamp(row.fundamental_updated_at), candles: [] };
      groups.set(key, instrument);
    }
    if (row.candle_date !== null) instrument.candles.push({
      date: row.candle_date, tradingAt: timestamp(row.candle_time), updatedAt: timestamp(row.fetched_at) ?? "",
      open: numeric(row.open), high: numeric(row.high), low: numeric(row.low), close: numeric(row.close), volume: numeric(row.volume),
    });
  }
  return [...groups.values()];
}

/** One SELECT snapshot, no fetch providers or writes. Values remain parameterized. */
export async function loadAccumulationInstruments(region: AccumulationRegion, asOf: Date): Promise<AccumulationInstrument[]> {
  const config = tables[region];
  const sql = "WITH eligible AS (SELECT u.market,u.code,u.name,f.market_cap,f.shares_outstanding,f.fetched_at AS fundamental_updated_at "
    + "FROM " + config.universe + " u "
    + "LEFT JOIN LATERAL (SELECT market_cap,shares_outstanding,fetched_at FROM instrument_fundamental_snapshots f "
    + "WHERE f.market=u.market AND f.code=u.code AND f.observed_at < (to_date($2, 'YYYYMMDD') + INTERVAL '1 day') "
    + "ORDER BY f.observed_at DESC NULLS LAST,f.fetched_at DESC NULLS LAST LIMIT 1) f ON true "
    + "WHERE u.enabled=true AND u.daily_active=true AND u.instrument_type='COMMON_STOCK' AND u.market=ANY($1::text[]) "
    + config.filter + "), ranked_candles AS (SELECT c.market,c.code,c.candle_date,c.candle_time,c.fetched_at,c.open,c.high,c.low,c.close,c.volume, "
    + "ROW_NUMBER() OVER (PARTITION BY c.market,c.code ORDER BY c.candle_date DESC) AS row_number FROM " + config.candles + " c "
    + "JOIN eligible e ON e.market=c.market AND e.code=c.code "
    + "WHERE c.timeframe='D' AND c.candle_date <= $2) "
    + "SELECT e.market,e.code,e.name,e.market_cap,e.shares_outstanding,e.fundamental_updated_at, "
    + "c.candle_date,c.candle_time,c.fetched_at,c.open,c.high,c.low,c.close,c.volume FROM eligible e "
    + "LEFT JOIN ranked_candles c ON c.market=e.market AND c.code=e.code AND c.row_number <= $3 "
    + "ORDER BY e.market,e.code,c.candle_date";
  const response = await getPool().query<AccumulationDbRow>({
    name: `accumulation-scan-${region.toLowerCase()}-daily-v1`,
    text: sql,
    values: [config.markets, cacheDateCutoff(region, asOf), ACCUMULATION_POLICY.historyBars],
  });
  return groupAccumulationRows(response.rows);
}
