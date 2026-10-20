import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { fetchFdaAdvisoryCalendar } from "@/lib/fda-advisory-calendar";
import { upsertInvestmentCalendarEvents } from "@/lib/investment-calendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const events = await fetchFdaAdvisoryCalendar();
    const upserted = await upsertInvestmentCalendarEvents(events);
    return NextResponse.json({ ok: true, source: "FDA_ADVISORY_CALENDAR", fetched: events.length, upserted });
  } catch (error) {
    console.error("[API /cron/fda-calendar] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FDA_CALENDAR_SYNC_FAILED" }, { status: 502 });
  }
}
