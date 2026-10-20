import { NextResponse } from "next/server";
import { fetchFdaAdvisoryCalendar } from "@/lib/fda-advisory-calendar";
import { upsertInvestmentCalendarEvents } from "@/lib/investment-calendar";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret")?.trim() || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  return Boolean(expected && supplied && supplied === expected);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const events = await fetchFdaAdvisoryCalendar();
    const upserted = await upsertInvestmentCalendarEvents(events);
    return NextResponse.json({ ok: true, source: "FDA_ADVISORY_CALENDAR", fetched: events.length, upserted });
  } catch (error) {
    console.error("[API /cron/fda-calendar] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "FDA_CALENDAR_SYNC_FAILED" }, { status: 502 });
  }
}
