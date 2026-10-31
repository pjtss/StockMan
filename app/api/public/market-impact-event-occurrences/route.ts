import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const EVENT_STATUSES = new Set(["REPORTED", "CONFIRMED_SCHEDULED", "ESTIMATED", "COMPLETED", "CANCELLED"]);
type Scope = { date: string | null; from: string | null; to: string | null; market: string | null; ticker: string | null; status: string | null; eventType: string | null; limit: number };
type Cursor = { version: 1; date: string; eventId: string; ordinal: number; scope: Scope };

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

function decodeCursor(value: string | null): Cursor | null | undefined {
  if (value === null) return null;
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (parsed.version !== 1 || typeof parsed.date !== "string" || validDate(parsed.date) !== parsed.date ||
      typeof parsed.eventId !== "string" || !parsed.eventId || parsed.eventId.length > 256 ||
      !Number.isSafeInteger(parsed.ordinal) || (parsed.ordinal ?? 0) < 1 || !parsed.scope || typeof parsed.scope !== "object") return undefined;
    return parsed as Cursor;
  } catch { return undefined; }
}

function encodeCursor(row: { occurrenceDate: string; eventId: string; ordinal: number }, scope: Scope) {
  return Buffer.from(JSON.stringify({ version: 1, date: row.occurrenceDate, eventId: row.eventId, ordinal: row.ordinal, scope } satisfies Cursor)).toString("base64url");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const dateValue = params.get("date"), fromValue = params.get("from"), toValue = params.get("to");
  const date = dateValue ? validDate(dateValue) : null, from = fromValue ? validDate(fromValue) : null, to = toValue ? validDate(toValue) : null;
  const marketValue = (params.get("market") ?? "").trim().toUpperCase();
  const tickerValue = (params.get("ticker") ?? "").trim().toUpperCase();
  const statusValue = (params.get("status") ?? "").trim().toUpperCase();
  const eventTypeValue = (params.get("eventType") ?? "").trim().toUpperCase();
  const cursor = decodeCursor(params.get("cursor"));
  const rawLimit = Number(params.get("limit") ?? 100);
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
  if ((dateValue && !date) || (fromValue && !from) || (toValue && !to) || (date && (from || to)) ||
    (marketValue && !["KR", "US"].includes(marketValue)) || (tickerValue && !/^[A-Z0-9._-]{1,32}$/.test(tickerValue)) ||
    (statusValue && !EVENT_STATUSES.has(statusValue)) || (eventTypeValue && !/^[A-Z][A-Z0-9_]{0,63}$/.test(eventTypeValue)) || cursor === undefined) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }
  const scope: Scope = { date, from, to, market: marketValue || null, ticker: tickerValue || null, status: statusValue || null, eventType: eventTypeValue || null, limit };
  if (cursor && JSON.stringify(cursor.scope) !== JSON.stringify(scope)) return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });

  try {
    const result = await getPool().query(
      `WITH occurrences AS (
         SELECT e.event_id AS "eventId", e.event_date AS "eventDate", e.market, e.ticker,
           e.company_name AS "companyName", e.event_type AS "eventType", e.event_key AS "eventKey", e.status AS "eventStatus",
           e.direction, e.impact_horizon AS "impactHorizon", e.title, e.summary, e.source_type AS "sourceType",
           e.source_id AS "sourceId", e.source_url AS "sourceUrl", e.published_at AS "publishedAt",
           item.value AS "keyDate", item.ordinality::int AS ordinal,
           CASE WHEN item.value ->> 'date' ~ '^\\d{4}-\\d{2}-\\d{2}$'
             THEN CASE WHEN to_char(to_date(item.value ->> 'date', 'YYYY-MM-DD'), 'YYYY-MM-DD') = item.value ->> 'date'
               THEN to_date(item.value ->> 'date', 'YYYY-MM-DD') END
           END AS occurrence_date
         FROM market_impact_events e
         CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.raw_event -> 'keyDates') = 'array' THEN e.raw_event -> 'keyDates' ELSE '[]'::jsonb END)
           WITH ORDINALITY AS item(value, ordinality)
         WHERE ($4::text IS NULL OR e.market = $4) AND ($5::text IS NULL OR e.ticker = $5)
           AND ($6::text IS NULL OR item.value ->> 'status' = $6) AND ($7::text IS NULL OR e.event_type = $7)
       )
       SELECT "eventId", TO_CHAR("eventDate", 'YYYY-MM-DD') AS "eventDate", market, ticker, "companyName", "eventType", "eventKey",
         "eventStatus", direction, "impactHorizon", title, summary, "sourceType", "sourceId", "sourceUrl", "publishedAt",
         "keyDate", ordinal, TO_CHAR(occurrence_date, 'YYYY-MM-DD') AS "occurrenceDate"
       FROM occurrences
       WHERE occurrence_date IS NOT NULL AND ($1::date IS NULL OR occurrence_date = $1::date)
         AND ($2::date IS NULL OR occurrence_date >= $2::date) AND ($3::date IS NULL OR occurrence_date <= $3::date)
         AND ($9::date IS NULL OR occurrence_date < $9::date OR
           (occurrence_date = $9::date AND ("eventId" > $10::text OR ("eventId" = $10::text AND ordinal > $11::int))))
       ORDER BY occurrence_date DESC, "eventId" ASC, ordinal ASC LIMIT $8`,
      [date, from, to, marketValue || null, tickerValue || null, statusValue || null, eventTypeValue || null, limit + 1, cursor?.date ?? null, cursor?.eventId ?? null, cursor?.ordinal ?? null],
    );
    const hasMore = result.rows.length > limit;
    const rows = result.rows.slice(0, limit);
    const last = rows.at(-1) as ({ occurrenceDate: string; eventId: string; ordinal: number } | undefined);
    return NextResponse.json({ ok: true, schemaVersion: "market-impact-event-occurrences.v1", query: scope, asOf: new Date().toISOString(), items: rows, nextCursor: hasMore && last ? encodeCursor(last, scope) : null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "MARKET_IMPACT_EVENT_OCCURRENCES_UNAVAILABLE" }, { status: 503 });
  }
}
