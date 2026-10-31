import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
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
  const rawLimit = Number(params.get("limit") ?? 100);
  const limit = Number.isSafeInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 500) : 100;
  if ((dateValue && !date) || (fromValue && !from) || (toValue && !to) || (date && (from || to)) || (market && !["KR", "US"].includes(market)) || (ticker && !/^[A-Z0-9._-]{1,32}$/.test(ticker))) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400 });
  }
  try {
    const result = await getPool().query(
      `SELECT event_id AS "eventId", TO_CHAR(event_date, 'YYYY-MM-DD') AS "eventDate", market, ticker,
        company_name AS "companyName", event_type AS "eventType", event_key AS "eventKey", status, direction,
        impact_horizon AS "impactHorizon", title, summary, rationale, confidence,
        source_type AS "sourceType", source_id AS "sourceId", source_url AS "sourceUrl",
        published_at AS "publishedAt", evidence, risks, limitations, updated_at AS "updatedAt"
       FROM market_impact_events
       WHERE ($1::date IS NULL OR event_date = $1::date)
         AND ($2::date IS NULL OR event_date >= $2::date)
         AND ($3::date IS NULL OR event_date <= $3::date)
         AND ($4::text IS NULL OR market = $4)
         AND ($5::text IS NULL OR ticker = $5)
       ORDER BY event_date DESC, published_at DESC NULLS LAST, event_id
       LIMIT $6`,
      [date, from, to, market || null, ticker || null, limit],
    );
    return NextResponse.json({ ok: true, schemaVersion: "market-impact-events.v1", query: { date, from, to, market: market || null, ticker: ticker || null, limit }, asOf: new Date().toISOString(), items: result.rows }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "MARKET_IMPACT_EVENTS_UNAVAILABLE" }, { status: 503 });
  }
}
