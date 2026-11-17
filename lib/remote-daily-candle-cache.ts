import type { OHLCVCandle } from "@/lib/kis-chart";
import { isValidCompactCalendarDate } from "./calendar-date-quality.mjs";

type RemoteDailyCandleResponse = {
  ok: boolean;
  candles?: OHLCVCandle[];
  metadata?: { dataUpdatedAt?: string | null };
};

function validCandles(candles: OHLCVCandle[], limit: number) {
  const byDate = new Map<string, OHLCVCandle>();
  for (const candle of candles) {
    const date = String(candle.date ?? "");
    if (!isValidCompactCalendarDate(date)) continue;
    const values = [candle.open, candle.high, candle.low, candle.close, candle.volume].map(Number);
    if (values.some((value) => !Number.isFinite(value)) || Math.min(...values.slice(0, 4)) <= 0 || values[4] < 0
      || values[1] < Math.max(values[0], values[2], values[3]) || values[2] > Math.min(values[0], values[1], values[3])) continue;
    byDate.set(date, { ...candle, date, open: values[0], high: values[1], low: values[2], close: values[3], volume: values[4] });
  }
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-limit);
}

export async function loadRemoteDailyCandles(input: {
  market: string;
  code: string;
  timeframe: "D" | "W" | "M";
  limit?: number;
}): Promise<{ candles: OHLCVCandle[]; updatedAt: string | null } | null> {
  const limit = Math.min(Math.max(input.limit ?? 120, 1), 300);
  const baseUrl = process.env.DAILY_CACHE_API_URL?.trim();
  if (!baseUrl) return null;

  const url = new URL("/api/public/daily-candles", baseUrl);
  url.searchParams.set("market", input.market.trim().toUpperCase());
  url.searchParams.set("code", input.code.trim().toUpperCase());
  url.searchParams.set("timeframe", input.timeframe);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, {
    cache: "no-store",
    // This is only the fast cache path; the chart API fallback handles a slow or empty cache read.
    signal: AbortSignal.timeout(750),
  });
  if (!response.ok) return null;
  const payload = await response.json() as RemoteDailyCandleResponse;
  if (!payload.ok || !Array.isArray(payload.candles)) return null;
  return { candles: validCandles(payload.candles, limit), updatedAt: payload.metadata?.dataUpdatedAt ?? null };
}

export async function loadRemoteDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit: number, timeframe: "D" | "W" | "M") {
  const baseUrl = process.env.DAILY_CACHE_API_URL?.trim();
  if (!baseUrl || !items.length) return null;
  const grouped = new Map<string, OHLCVCandle[]>();
  const byMarket = new Map<string, string[]>();
  const seenByMarket = new Map<string, Set<string>>();
  const supportedMarkets = new Set(["KR", "US", "KOSPI", "KOSDAQ", "NAS", "NYS", "AMS"]);
  for (const item of items) {
    if (!item || typeof item.market !== "string" || typeof item.code !== "string") return null;
    const market = item.market.trim().toUpperCase();
    const code = item.code.trim().toUpperCase();
    if (!supportedMarkets.has(market) || !code || code.length > 32 || code.includes(",")) return null;
    const codes = byMarket.get(market) ?? [];
    const seen = seenByMarket.get(market) ?? new Set<string>();
    if (!seen.has(code)) {
      codes.push(code);
      seen.add(code);
    }
    byMarket.set(market, codes);
    seenByMarket.set(market, seen);
  }
  for (const [market, codes] of byMarket) {
    const url = new URL("/api/public/daily-candles", baseUrl);
    url.searchParams.set("market", market);
    url.searchParams.set("codes", codes.join(","));
    url.searchParams.set("timeframe", timeframe);
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 300)));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { ok: boolean; items?: Array<{ code: string; candles?: OHLCVCandle[] }> };
    if (!payload.ok || !Array.isArray(payload.items)) return null;
    for (const item of payload.items) grouped.set(`${market}:${item.code}`, Array.isArray(item.candles) ? item.candles : []);
  }
  return grouped;
}
