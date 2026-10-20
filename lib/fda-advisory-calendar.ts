// jsdom is already a runtime dependency; this project does not install its optional type package.
// @ts-expect-error jsdom has no bundled declaration in the current dependency set.
import { JSDOM } from "jsdom";
import type { CalendarEventInput } from "./investment-calendar";

export const FDA_ADVISORY_CALENDAR_URL = "https://www.fda.gov/advisory-committees/advisory-committee-calendar";

function dateKey(value: string) {
  const match = value.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} 00:00:00 UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function clean(value: string) { return value.replace(/\s+/g, " ").trim(); }

export async function fetchFdaAdvisoryCalendar(fetcher: typeof fetch = fetch): Promise<CalendarEventInput[]> {
  const response = await fetcher(FDA_ADVISORY_CALENDAR_URL, { headers: { accept: "text/html", "user-agent": "StockMan/1.0 public-calendar-reader" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`FDA calendar HTTP ${response.status}`);
  const html = await response.text();
  const document = new JSDOM(html, { url: FDA_ADVISORY_CALENDAR_URL }).window.document;
  const events: CalendarEventInput[] = [];
  for (const row of Array.from(document.querySelectorAll("table tr")) as any[]) {
    const cells = (Array.from(row.querySelectorAll("th,td")) as any[]).map((cell) => clean(cell.textContent ?? ""));
    const link = row.querySelector("a[href]") as HTMLAnchorElement | null;
    const title = clean(link?.textContent ?? cells.find((cell) => cell.length > 10) ?? "");
    const eventDate = dateKey(cells.join(" "));
    if (!title || !eventDate || !link?.href) continue;
    events.push({ market: "US", code: null, companyName: "", eventType: "FDA_ADCOM", eventDate, eventEndDate: null, title, description: cells.join(" · "), source: "FDA_ADVISORY_CALENDAR", sourceUrl: link.href, externalId: link.href, rawPayload: { cells } });
  }
  return events;
}
