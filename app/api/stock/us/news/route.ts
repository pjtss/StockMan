import { NextResponse } from "next/server";
import { fetchTickerNews, type KisNewsPeriod } from "@/lib/kis-news-radar";

export const dynamic = "force-dynamic";

const periods = new Set<KisNewsPeriod>(["today", "3d", "7d", "1m"]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const ticker = params.get("ticker") || "";
  const period = (params.get("period") || "today") as KisNewsPeriod;
  const exchange = (params.get("exchange") || "").toUpperCase();
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker || normalizedTicker.length > 32 || !/^[A-Z0-9./_-]+$/.test(normalizedTicker)) return NextResponse.json({ ok: false, error: "invalid ticker" }, { status: 400 });
  if (!periods.has(period)) return NextResponse.json({ ok: false, error: "period must be today, 3d, 7d, or 1m" }, { status: 400 });
  if (exchange && !/^(NAS|NYS|AMS)$/.test(exchange)) return NextResponse.json({ ok: false, error: "invalid exchange" }, { status: 400 });
  try {
    const result = await fetchTickerNews(normalizedTicker, { period, exchange: exchange || undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "US_STOCK_NEWS_UNAVAILABLE", ticker, period }, { status: 503 });
  }
}
