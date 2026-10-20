import { getPool } from "@/lib/db";

export type IntradayTurnoverObservation = {
  market: string;
  code: string;
  sessionDate: string;
  bucketAt: Date;
  observedAt: Date;
  currency: "KRW" | "USD";
  price: number | null;
  volume: number | null;
  sourceTradingValue: number | null;
  minuteTradingValue: number;
  minuteTradingValueSource: "KIS_CUMULATIVE_DELTA" | "PRICE_VOLUME_FALLBACK";
  marketCap: number | null;
  rollingTradingValue: number;
  turnoverRatio: number | null;
  sourcePayload: unknown;
};

const CHUNK_SIZE = 250;
const COLUMNS_PER_ROW = 15;

/** Persist one KIS-derived minute bucket per instrument/session; repeated polls upsert the same bucket. */
export async function saveIntradayTurnoverObservations(observations: IntradayTurnoverObservation[]) {
  if (!observations.length) return 0;
  const pool = getPool();
  for (let start = 0; start < observations.length; start += CHUNK_SIZE) {
    const chunk = observations.slice(start, start + CHUNK_SIZE);
    const values: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((row, index) => {
      const offset = index * COLUMNS_PER_ROW;
      values.push(`(${Array.from({ length: 14 }, (_, column) => `$${offset + column + 1}`).join(",")},'KIS',$${offset + COLUMNS_PER_ROW}::jsonb)`);
      params.push(
        row.market, row.code, row.sessionDate, row.bucketAt, row.observedAt, row.currency,
        row.price, row.volume, row.sourceTradingValue, row.minuteTradingValue, row.minuteTradingValueSource,
        row.marketCap, row.rollingTradingValue, row.turnoverRatio,
        JSON.stringify(row.sourcePayload ?? {}),
      );
    });
    await pool.query(
      `INSERT INTO intraday_turnover_observations (
        market,code,session_date,bucket_at,observed_at,currency,price,volume,
        source_trading_value,minute_trading_value,minute_trading_value_source,
        market_cap,rolling_trading_value,turnover_ratio,source,source_payload
      ) VALUES ${values.join(",")}
      ON CONFLICT (market,code,session_date,bucket_at) DO UPDATE SET
        observed_at=EXCLUDED.observed_at, currency=EXCLUDED.currency, price=EXCLUDED.price,
        volume=EXCLUDED.volume, source_trading_value=EXCLUDED.source_trading_value,
        minute_trading_value=EXCLUDED.minute_trading_value,
        minute_trading_value_source=EXCLUDED.minute_trading_value_source,
        market_cap=EXCLUDED.market_cap,
        rolling_trading_value=EXCLUDED.rolling_trading_value, turnover_ratio=EXCLUDED.turnover_ratio,
        source_payload=EXCLUDED.source_payload
      WHERE intraday_turnover_observations.price IS DISTINCT FROM EXCLUDED.price
         OR intraday_turnover_observations.volume IS DISTINCT FROM EXCLUDED.volume
         OR intraday_turnover_observations.source_trading_value IS DISTINCT FROM EXCLUDED.source_trading_value
         OR intraday_turnover_observations.minute_trading_value IS DISTINCT FROM EXCLUDED.minute_trading_value
         OR intraday_turnover_observations.minute_trading_value_source IS DISTINCT FROM EXCLUDED.minute_trading_value_source
         OR intraday_turnover_observations.market_cap IS DISTINCT FROM EXCLUDED.market_cap
         OR intraday_turnover_observations.rolling_trading_value IS DISTINCT FROM EXCLUDED.rolling_trading_value
         OR intraday_turnover_observations.turnover_ratio IS DISTINCT FROM EXCLUDED.turnover_ratio
         OR intraday_turnover_observations.source_payload IS DISTINCT FROM EXCLUDED.source_payload`,
      params,
    );
  }
  return observations.length;
}
