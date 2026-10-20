import { describe, expect, it, vi } from "vitest";
import { collectMissingSecFilingDocuments } from "./sec-filing-collection";

describe("SEC filing collection", () => {
  it("collects only filings without stored primary text and does not analyze", async () => {
    const collectDocument = vi.fn(async (accession: string) => accession === "a-2" ? { ok: false, error: "HTTP 503" } : { ok: true });
    const result = await collectMissingSecFilingDocuments("0000000001", {
      loadSubmissions: async () => [
        { accession: "a-1", form: "8-K", primaryTextPresent: true },
        { accession: "a-2", form: "10-Q", primaryTextPresent: false },
        { accession: "a-3", form: "4", primaryTextPresent: false },
      ],
      collectDocument,
    });
    expect(collectDocument).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ considered: 3, skippedCached: 1, collected: 1 });
    expect(result.failed).toEqual([{ accession: "a-2", error: "HTTP 503" }]);
  });
});
