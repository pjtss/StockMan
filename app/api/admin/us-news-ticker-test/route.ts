import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchTickerNews, type KisNewsPeriod } from "@/lib/kis-news-radar";

export const dynamic = "force-dynamic";
const periods = new Set<KisNewsPeriod>(["today", "3d", "7d", "1m"]);

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const ticker = params.get("ticker") || "";
  const period = (params.get("period") || "today") as KisNewsPeriod;
  const exchange = (params.get("exchange") || "").toUpperCase();
  if (!ticker.trim()) return NextResponse.json({ ok: false, error: "ticker is required" }, { status: 400 });
  if (!periods.has(period)) return NextResponse.json({ ok: false, error: "period must be today, 3d, 7d, or 1m" }, { status: 400 });
  try {
    const result = await fetchTickerNews(ticker, { period, exchange: exchange || undefined });
    return NextResponse.json({ ok: true, mode: "ADMIN_MANUAL_TEST", request: { ticker, period, exchange: exchange || null }, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, mode: "ADMIN_MANUAL_TEST", error: error instanceof Error ? error.message : String(error), request: { ticker, period, exchange: exchange || null } }, { status: 502 });
  }
}
