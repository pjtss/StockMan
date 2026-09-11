import { getPool } from "./db";

export const CALENDAR_EVENT_TYPES = ["IPO", "EARNINGS", "EX_DIVIDEND", "DIVIDEND_PAYMENT", "SHAREHOLDER_MEETING", "LOCKUP_EXPIRY"] as const;
export type CalendarEventType = typeof CALENDAR_EVENT_TYPES[number];

export type InvestmentCalendarEvent = {
  id: number; market: string; code: string | null; companyName: string; eventType: CalendarEventType;
  eventDate: string; eventEndDate: string | null; title: string; description: string; source: string; sourceUrl: string | null;
};

export type CalendarEventInput = Omit<InvestmentCalendarEvent, "id"> & { externalId: string; rawPayload?: unknown };

export async function upsertInvestmentCalendarEvents(events: CalendarEventInput[]) {
  if (!events.length) return 0;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    for (const event of events) {
      await client.query(`INSERT INTO investment_calendar_events (market, code, company_name, event_type, event_date, event_end_date, title, description, source, source_url, external_id, raw_payload, fetched_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,NOW(),NOW()) ON CONFLICT (source, external_id) DO UPDATE SET market=EXCLUDED.market, code=EXCLUDED.code, company_name=EXCLUDED.company_name, event_type=EXCLUDED.event_type, event_date=EXCLUDED.event_date, event_end_date=EXCLUDED.event_end_date, title=EXCLUDED.title, description=EXCLUDED.description, source_url=EXCLUDED.source_url, raw_payload=EXCLUDED.raw_payload, fetched_at=NOW(), updated_at=NOW()`, [event.market, event.code, event.companyName, event.eventType, event.eventDate, event.eventEndDate, event.title, event.description, event.source, event.sourceUrl, event.externalId, JSON.stringify(event.rawPayload ?? {})]);
    }
    await client.query("COMMIT");
    return events.length;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

export async function listInvestmentCalendarEvents(input: { from: string; to: string; type?: string; market?: string; code?: string; limit?: number }) {
  const values: unknown[] = [input.from, input.to];
  const conditions = ["event_date >= $1::date", "event_date <= $2::date"];
  if (input.type && CALENDAR_EVENT_TYPES.includes(input.type as CalendarEventType)) { values.push(input.type); conditions.push(`event_type = $${values.length}`); }
  if (input.market && input.market !== "ALL") { values.push(input.market); conditions.push(`market = $${values.length}`); }
  if (input.code) { values.push(input.code); conditions.push(`code = $${values.length}`); }
  values.push(Math.min(Math.max(input.limit ?? 200, 1), 1000));
  const result = await getPool().query<InvestmentCalendarEvent>(`SELECT id, market, code, company_name AS "companyName", event_type AS "eventType", event_date::text AS "eventDate", event_end_date::text AS "eventEndDate", title, description, source, source_url AS "sourceUrl" FROM investment_calendar_events WHERE ${conditions.join(" AND ")} ORDER BY event_date ASC, event_type ASC, company_name ASC LIMIT $${values.length}`, values);
  return result.rows;
}
