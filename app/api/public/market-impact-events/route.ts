import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const EVENT_STATUSES = new Set(["REPORTED", "CONFIRMED_SCHEDULED", "ESTIMATED", "COMPLETED", "CANCELLED"]);

type EventQueryScope = {
  date: string | null;
  from: string | null;
  to: string | null;
  market: string | null;
  ticker: string | null;
  status: string | null;
  eventType: string | null;
  limit: number;
};

type EventCursor = {
  version: 1;
  eventDate: string;
  publishedAt: string | null;
  eventId: string;
  scope: EventQueryScope;
};

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function decodeCursor(value: string | null): EventCursor | null | undefined {
  if (value === null) return null;
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EventCursor>;
    if (
      parsed.version !== 1 ||
      typeof parsed.eventDate !== "string" || validDate(parsed.eventDate) !== parsed.eventDate ||
      !(parsed.publishedAt === null || (typeof parsed.publishedAt === "string" && !Number.isNaN(Date.parse(parsed.publishedAt)))) ||
      typeof parsed.eventId !== "string" || !parsed.eventId.trim() || parsed.eventId.length > 256 ||
      !parsed.scope || typeof parsed.scope !== "object" || Array.isArray(parsed.scope)
    ) return undefined;
    return parsed as EventCursor;
  } catch {
    return undefined;
  }
}

function encodeCursor(event: { eventDate: string; publishedAtCursor: string | null; eventId: string }, scope: EventQueryScope) {
  return Buffer.from(JSON.stringify({
    version: 1,
    eventDate: event.eventDate,
    publishedAt: event.publishedAtCursor,
    eventId: event.eventId,
    scope,
  } satisfies EventCursor)).toString("base64url");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const dateValue = params.get("date");
  const fromValue = params.get("from");
  const toValue = params.get("to");
  const date = dateValue ? validDate(dateValue) : null;
  const from = fromValue ? validDate(fromValue) : null;
  const to = toValue ? validDate(toValue) : null;
  const market = (params.get("market") ?? "").trim().toUpperCase();
  const ticker = (params.get("ticker") ?? "").trim().toUpperCase();
  const status = (params.get("status") ?? "").trim().toUpperCase();
  const eventType = (params.get("eventType") ?? "").trim().toUpperCase();
  const cursorValue = params.get("cursor");
  const cursor = decodeCursor(cursorValue);
  const rawLimit = Number(params.get("limit") ?? 100);
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
  if (
    (dateValue && !date) || (fromValue && !from) || (toValue && !to) || (date && (from || to)) ||
    (market && !["KR", "US"].includes(market)) || (ticker && !/^[A-Z0-9._-]{1,32}$/.test(ticker)) ||
    (status && !EVENT_STATUSES.has(status)) || (eventType && !/^[A-Z][A-Z0-9_]{0,63}$/.test(eventType)) || cursor === undefined
  ) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }
  const scope: EventQueryScope = { date, from, to, market: market || null, ticker: ticker || null, status: status || null, eventType: eventType || null, limit };
  if (cursor && JSON.stringify(cursor.scope) !== JSON.stringify(scope)) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }
  try {
    const result = await getPool().query(
      `SELECT event_id AS "eventId", TO_CHAR(event_date, 'YYYY-MM-DD') AS "eventDate", market, ticker,
        company_name AS "companyName", event_type AS "eventType", event_key AS "eventKey", status, direction,
        impact_horizon AS "impactHorizon", title, summary, rationale, confidence,
        source_type AS "sourceType", source_id AS "sourceId", source_url AS "sourceUrl",
        published_at AS "publishedAt", published_at::text AS "publishedAtCursor",
        CASE WHEN jsonb_typeof(raw_event -> 'keyDates') = 'array' THEN raw_event -> 'keyDates' ELSE '[]'::jsonb END AS "keyDates",
        CASE WHEN jsonb_typeof(raw_event -> 'eventDetails') = 'object' THEN raw_event -> 'eventDetails' ELSE '{}'::jsonb END AS "eventDetails",
        evidence, risks, limitations, updated_at AS "updatedAt"
       FROM market_impact_events
       WHERE ($1::date IS NULL OR event_date = $1::date)
         AND ($2::date IS NULL OR event_date >= $2::date)
         AND ($3::date IS NULL OR event_date <= $3::date)
         AND ($4::text IS NULL OR market = $4)
         AND ($5::text IS NULL OR ticker = $5)
         AND ($6::text IS NULL OR status = $6)
         AND ($7::text IS NULL OR event_type = $7)
         AND (
           $9::date IS NULL OR event_date < $9::date OR
           (event_date = $9::date AND (
             ($10::timestamptz IS NOT NULL AND (
               published_at < $10::timestamptz OR published_at IS NULL OR
               (published_at = $10::timestamptz AND event_id > $11::text)
             )) OR
             ($10::timestamptz IS NULL AND published_at IS NULL AND event_id > $11::text)
           ))
         )
       ORDER BY event_date DESC, published_at DESC NULLS LAST, event_id
       LIMIT $8`,
      [date, from, to, market || null, ticker || null, status || null, eventType || null, limit + 1, cursor?.eventDate ?? null, cursor?.publishedAt ?? null, cursor?.eventId ?? null],
    );
    const hasMore = result.rows.length > limit;
    const pageRows = result.rows.slice(0, limit);
    const last = pageRows.at(-1) as ({ eventDate: string; publishedAtCursor: string | null; eventId: string } | undefined);
    const items = pageRows.map(({ publishedAtCursor: _publishedAtCursor, ...event }) => event);
    return NextResponse.json({
      ok: true,
      schemaVersion: "market-impact-events.v1",
      query: scope,
      asOf: new Date().toISOString(),
      items,
      nextCursor: hasMore && last ? encodeCursor(last, scope) : null,
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "MARKET_IMPACT_EVENTS_UNAVAILABLE" }, { status: 503 });
  }
}
