import type { ChartData } from "@/lib/kis-chart";

export async function loadRemoteStockChart(input: {
  market: "KR" | "US";
  code: string;
  company?: string | null;
  timeframe: "D" | "W" | "M";
  exchange?: string | null;
  callerUrl: string;
}): Promise<ChartData | null> {
  const baseUrl = process.env.DAILY_CACHE_API_URL?.trim();
  if (!baseUrl) return null;

  try {
    const base = new URL(baseUrl);
    if (base.origin === new URL(input.callerUrl).origin) return null;
    const url = new URL("/api/stock/chart", base);
    url.searchParams.set("market", input.market);
    url.searchParams.set("code", input.code);
    url.searchParams.set("timeframe", input.timeframe);
    if (input.company) url.searchParams.set("company", input.company);
    if (input.exchange) url.searchParams.set("exchange", input.exchange);

    const response = await fetch(url, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
    const payload = await response.json() as Partial<ChartData> & { error?: string };
    if (!Array.isArray(payload.candles) || payload.candles.length === 0) return null;
    return payload as ChartData;
  } catch {
    return null;
  }
}
