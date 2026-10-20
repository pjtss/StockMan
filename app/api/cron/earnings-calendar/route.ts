import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { fetchNasdaqEarningsCalendar } from "@/lib/nasdaq-earnings-calendar";
import { upsertInvestmentCalendarEvents } from "@/lib/investment-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + 45 * 86_400_000).toISOString().slice(0, 10);
  try {
    const events = await fetchNasdaqEarningsCalendar(from, to);
    const upserted = await upsertInvestmentCalendarEvents(events);
    return NextResponse.json({ ok: true, source: "NASDAQ_EARNINGS_CALENDAR", from, to, fetched: events.length, upserted });
  } catch (error) {
    console.error("[API /cron/earnings-calendar] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "EARNINGS_CALENDAR_SYNC_FAILED" }, { status: 502 });
  }
}
