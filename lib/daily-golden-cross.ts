import { writeKisCache } from "@/lib/kis-cache";

export type GoldenCandle = { date: string; close: number };
export type GoldenScope = { market: string; code: string; name?: string };
export type GoldenCrossResult = GoldenScope & {
  timeframe: "D";
  qualifies: boolean;
  latestDate: string | null;
  previousDate: string | null;
  sma9: number | null;
  sma20: number | null;
  previousSma9: number | null;
  previousSma20: number | null;
  candleCount: number;
  reason: "GOLDEN_CROSS" | "NOT_CROSSED" | "INSUFFICIENT_HISTORY";
};

function average(values: number[]) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

export function calculateGoldenCross(candles: GoldenCandle[]): Omit<GoldenCrossResult, "market" | "code" | "name" | "timeframe"> {
  const rows = candles.filter((row) => Number.isFinite(row.close) && row.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 21) return { qualifies: false, latestDate: rows.at(-1)?.date ?? null, previousDate: rows.at(-2)?.date ?? null, sma9: null, sma20: null, previousSma9: null, previousSma20: null, candleCount: rows.length, reason: "INSUFFICIENT_HISTORY" };
  const at = (index: number) => ({ sma9: average(rows.slice(index - 8, index + 1).map((row) => row.close)), sma20: average(rows.slice(index - 19, index + 1).map((row) => row.close)) });
  const latest = at(rows.length - 1);
  const previous = at(rows.length - 2);
  const qualifies = previous.sma9 <= previous.sma20 && latest.sma9 > latest.sma20;
  return { qualifies, latestDate: rows.at(-1)?.date ?? null, previousDate: rows.at(-2)?.date ?? null, sma9: Number(latest.sma9.toFixed(6)), sma20: Number(latest.sma20.toFixed(6)), previousSma9: Number(previous.sma9.toFixed(6)), previousSma20: Number(previous.sma20.toFixed(6)), candleCount: rows.length, reason: qualifies ? "GOLDEN_CROSS" : "NOT_CROSSED" };
}

export async function persistGoldenCrossResults(scope: "KR" | "US", results: GoldenCrossResult[]) {
  const timeframe = "D";
  const qualified = results.filter((row) => row.qualifies);
  await writeKisCache(`daily-golden-cross:${scope}:${timeframe}`, { scope, timeframe, updatedAt: new Date().toISOString(), qualifiedCount: qualified.length, qualified, scannedCount: results.length });
  return { qualifiedCount: qualified.length, cached: true, cacheKey: `daily-golden-cross:${scope}:${timeframe}` };
}
