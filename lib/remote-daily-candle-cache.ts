import type { OHLCVCandle } from "@/lib/kis-chart";

type RemoteDailyCandleResponse = {
  ok: boolean;
  candles?: OHLCVCandle[];
  metadata?: { dataUpdatedAt?: string | null };
};

export async function loadRemoteDailyCandles(input: {
  market: string;
  code: string;
  timeframe: "D" | "W" | "M";
  limit?: number;
}): Promise<{ candles: OHLCVCandle[]; updatedAt: string | null } | null> {
  const baseUrl = process.env.DAILY_CACHE_API_URL?.trim();
  const apiKey = process.env.DAILY_CACHE_READ_API_KEY?.trim();
  if (!baseUrl || !apiKey) return null;

  const url = new URL("/api/public/daily-candles", baseUrl);
  url.searchParams.set("market", input.market.trim().toUpperCase());
  url.searchParams.set("code", input.code.trim().toUpperCase());
  url.searchParams.set("timeframe", input.timeframe);
  url.searchParams.set("limit", String(Math.min(Math.max(input.limit ?? 120, 1), 300)));

  const response = await fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    cache: "no-store",
    // This is only the fast cache path; the chart API fallback handles a slow or empty cache read.
    signal: AbortSignal.timeout(750),
  });
  if (!response.ok) return null;
  const payload = await response.json() as RemoteDailyCandleResponse;
  if (!payload.ok || !Array.isArray(payload.candles)) return null;
  return { candles: payload.candles, updatedAt: payload.metadata?.dataUpdatedAt ?? null };
}

export async function loadRemoteDailyCandlesBulk(items: Array<{ market: string; code: string }>, limit: number, timeframe: "D" | "W" | "M") {
  const baseUrl = process.env.DAILY_CACHE_API_URL?.trim();
  const apiKey = process.env.DAILY_CACHE_READ_API_KEY?.trim();
  if (!baseUrl || !apiKey || !items.length) return null;
  const grouped = new Map<string, OHLCVCandle[]>();
  const byMarket = new Map<string, string[]>();
  for (const item of items) {
    const market = item.market.trim().toUpperCase();
    const code = item.code.trim().toUpperCase();
    const codes = byMarket.get(market) ?? [];
    if (!codes.includes(code)) codes.push(code);
    byMarket.set(market, codes);
  }
  for (const [market, codes] of byMarket) {
    const url = new URL("/api/public/daily-candles", baseUrl);
    url.searchParams.set("market", market);
    url.searchParams.set("codes", codes.join(","));
    url.searchParams.set("timeframe", timeframe);
    url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 300)));
    const response = await fetch(url, { headers: { authorization: `Bearer ${apiKey}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return null;
    const payload = await response.json() as { ok: boolean; items?: Array<{ code: string; candles?: OHLCVCandle[] }> };
    if (!payload.ok || !Array.isArray(payload.items)) return null;
    for (const item of payload.items) grouped.set(`${market}:${item.code}`, Array.isArray(item.candles) ? item.candles : []);
  }
  return grouped;
}
