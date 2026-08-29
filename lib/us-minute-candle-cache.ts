import { getPool } from "@/lib/db";
import { fetchUsMinuteTurnover } from "@/lib/kis-us-minute-turnover";

export async function refreshUsMinuteCandles(market: string, code: string) {
  const response = await fetchUsMinuteTurnover({ market, code });
  if (!response?.ok) throw new Error(`KIS US minute API failed (${response?.status ?? 0})`);
  const rows = response.points.map((p) => {
    const [date, time] = String(p.time).split(/[T ]/);
    return { date: date.replace(/-/g, ""), time: (time ?? "").replace(/:/g, "").slice(0, 6), price: p.price, high: p.high ?? p.price, low: p.low ?? p.price, volume: p.volume ?? 0 };
  }).filter((p) => /^\d{8}$/.test(p.date) && /^\d{6}$/.test(p.time) && p.price > 0);
  const pool = getPool();
  if (rows.length) {
    const values: unknown[] = [];
    const placeholders = rows.map((p, index) => {
      const offset = index * 9;
      values.push(market, code, p.date, p.time, p.price, p.high, p.low, p.price, p.volume);
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},'KIS',NOW())`;
    }).join(",");
    await pool.query(`INSERT INTO us_minute_candles (market,code,candle_date,candle_time,open,high,low,close,volume,source,fetched_at) VALUES ${placeholders} ON CONFLICT (market,code,candle_date,candle_time) DO UPDATE SET high=EXCLUDED.high,low=EXCLUDED.low,close=EXCLUDED.close,volume=EXCLUDED.volume,fetched_at=NOW()`, values);
  }
  return { fetched: rows.length };
}
