import { describe, expect, it } from "vitest";
import { fetchFdaAdvisoryCalendar } from "./fda-advisory-calendar";

function response(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

describe("FDA advisory calendar", () => {
  it("normalizes dated meeting rows into calendar events", async () => {
    const result = await fetchFdaAdvisoryCalendar(async () => response(`
      <table><tbody>
        <tr><th>Date</th><th>Meeting</th></tr>
        <tr><td>October 30, 2026</td><td><a href="/meeting-announcement">Dermatologic and Ophthalmic Drugs Advisory Committee</a></td></tr>
      </tbody></table>
    `));
    expect(result).toEqual([expect.objectContaining({ eventType: "FDA_ADCOM", eventDate: "2026-10-30", source: "FDA_ADVISORY_CALENDAR", sourceUrl: "https://www.fda.gov/meeting-announcement" })]);
  });

  it("skips rows without a date or source link", async () => {
    const result = await fetchFdaAdvisoryCalendar(async () => response(`<table><tr><td>Meeting without a link</td></tr><tr><td><a href="/no-date">No date</a></td></tr></table>`));
    expect(result).toEqual([]);
  });
});
