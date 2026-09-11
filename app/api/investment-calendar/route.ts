import { NextResponse } from "next/server";
import { CALENDAR_EVENT_TYPES, listInvestmentCalendarEvents, upsertInvestmentCalendarEvents, type CalendarEventInput } from "@/lib/investment-calendar";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || new Date(Date.now() + 1000 * 60 * 60 * 24 * 45).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
  try { const items = await listInvestmentCalendarEvents({ from, to, type: url.searchParams.get("type") || undefined, market: url.searchParams.get("market") || undefined, code: url.searchParams.get("code") || undefined }); return NextResponse.json({ ok: true, from, to, types: CALENDAR_EVENT_TYPES, items, count: items.length }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CALENDAR_QUERY_FAILED" }, { status: 503 }); }
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const body = await request.json();
    if (!Array.isArray(body?.events) || body.events.length > 5000) return NextResponse.json({ ok: false, error: "INVALID_EVENTS" }, { status: 400 });
    const events = body.events as CalendarEventInput[];
    if (events.some((event) => !event.source || !event.externalId || !event.eventDate || !CALENDAR_EVENT_TYPES.includes(event.eventType))) return NextResponse.json({ ok: false, error: "INVALID_EVENT_FIELDS" }, { status: 400 });
    const count = await upsertInvestmentCalendarEvents(events);
    return NextResponse.json({ ok: true, upserted: count });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "CALENDAR_IMPORT_FAILED" }, { status: 503 }); }
}
