import type { CalendarEventInput } from "./investment-calendar";

const NASDAQ_EARNINGS_URL = "https://api.nasdaq.com/api/calendar/earnings";

function clean(value: unknown) { return String(value ?? "").replace(/\s+/g, " ").trim(); }

function dateKey(value: unknown) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  return `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
}

export async function fetchNasdaqEarningsCalendar(from: string, to: string, fetcher: typeof fetch = fetch): Promise<CalendarEventInput[]> {
  const url = new URL(NASDAQ_EARNINGS_URL);
  url.searchParams.set("fromdate", from);
  url.searchParams.set("todate", to);
  const response = await fetcher(url, { headers: { accept: "application/json", "user-agent": "StockMan/1.0 earnings-calendar-reader" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Nasdaq earnings HTTP ${response.status}`);
  const payload = await response.json() as { data?: { rows?: Array<Record<string, unknown>> } };
  const rows = Array.isArray(payload.data?.rows) ? payload.data.rows : [];
  return rows.flatMap((row) => {
    const code = clean(row.symbol).toUpperCase();
    const eventDate = dateKey(row.announceDate);
    if (!code || !eventDate) return [];
    const companyName = clean(row.name);
    const period = clean(row.fiscalQuarterEnding);
    const timing = clean(row.time);
    return [{ market: "US", code, companyName, eventType: "EARNINGS", eventDate, eventEndDate: null, title: `${companyName || code} 실적 발표 예정`, description: [period && `회계분기 ${period}`, timing && `발표 시점 ${timing}`, "Nasdaq 일정 기준·회사 IR 확인 필요"].filter(Boolean).join(" · "), source: "NASDAQ_EARNINGS_CALENDAR", sourceUrl: `https://www.nasdaq.com/market-activity/earnings/${code}`, externalId: `${code}:${eventDate}`, rawPayload: row }];
  });
}
