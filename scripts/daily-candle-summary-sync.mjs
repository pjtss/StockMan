import { isDailyCacheWriteVerified } from "../lib/daily-cache-sync-result.mjs";
import { validDailyCandleSql } from "./daily-candle-quality-sql.mjs";

const TABLES = {
  KR: { raw: "kr_instrument_universe_candles", summary: "kr_latest_daily_candles" },
  US: { raw: "us_instrument_universe_candles", summary: "us_latest_daily_candles" },
};

/** Rebuild affected daily summary rows from each instrument's latest valid source candle. */
export async function refreshDailyCandleSummaries(client, marketKind, market, codes) {
  const tables = TABLES[marketKind];
  if (!tables) throw new Error("INVALID_DAILY_SUMMARY_MARKET_KIND");
  const affectedCodes = [...new Set(codes.map((code) => String(code).trim().toUpperCase()).filter(Boolean))];
  if (affectedCodes.length === 0) return 0;

  await client.query(`DELETE FROM ${tables.summary} s
    WHERE s.market=$1 AND s.code=ANY($2::text[]) AND NOT (${validDailyCandleSql("s")})`, [market, affectedCodes]);
  const latestResult = await client.query(`
    SELECT DISTINCT ON (c.code) c.code,c.candle_date AS date,c.open,c.high,c.low,c.close,c.volume
      FROM ${tables.raw} c
     WHERE c.market=$1 AND c.code=ANY($2::text[]) AND c.timeframe='D'
       AND ${validDailyCandleSql("c")}
     ORDER BY c.code,c.candle_date DESC,c.fetched_at DESC`, [market, affectedCodes]);
  const latestRows = latestResult.rows;
  if (latestRows.length === 0) return 0;

  await client.query(`
    INSERT INTO ${tables.summary} (market,code,candle_date,open,high,low,close,volume,fetched_at)
    SELECT $1,input.code,input.candle_date,input.open,input.high,input.low,input.close,input.volume,transaction_timestamp()
      FROM unnest($2::text[],$3::text[],$4::double precision[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[])
        AS input(code,candle_date,open,high,low,close,volume)
    ON CONFLICT (market,code) DO UPDATE SET
      candle_date=EXCLUDED.candle_date,open=EXCLUDED.open,high=EXCLUDED.high,low=EXCLUDED.low,
      close=EXCLUDED.close,volume=EXCLUDED.volume,fetched_at=EXCLUDED.fetched_at`,
  [market, latestRows.map((row) => row.code), latestRows.map((row) => row.date), latestRows.map((row) => row.open), latestRows.map((row) => row.high), latestRows.map((row) => row.low), latestRows.map((row) => row.close), latestRows.map((row) => row.volume)]);

  const verifiedResult = await client.query(`
    SELECT COUNT(*)::int AS count
      FROM unnest($2::text[],$3::text[],$4::double precision[],$5::double precision[],$6::double precision[],$7::double precision[],$8::double precision[])
        AS expected(code,candle_date,open,high,low,close,volume)
      JOIN ${tables.summary} stored ON stored.market=$1 AND stored.code=expected.code
     WHERE stored.candle_date=expected.candle_date
       AND stored.open IS NOT DISTINCT FROM expected.open AND stored.high IS NOT DISTINCT FROM expected.high
       AND stored.low IS NOT DISTINCT FROM expected.low AND stored.close IS NOT DISTINCT FROM expected.close
       AND stored.volume IS NOT DISTINCT FROM expected.volume`,
  [market, latestRows.map((row) => row.code), latestRows.map((row) => row.date), latestRows.map((row) => row.open), latestRows.map((row) => row.high), latestRows.map((row) => row.low), latestRows.map((row) => row.close), latestRows.map((row) => row.volume)]);
  const verifiedCount = Number(verifiedResult.rows[0]?.count ?? 0);
  if (!isDailyCacheWriteVerified(latestRows.length, verifiedCount)) {
    throw new Error(`daily summary verification mismatch market=${market} kind=${marketKind} expected=${latestRows.length} verified=${verifiedCount}`);
  }
  return verifiedCount;
}
