import { describe, expect, it, vi } from "vitest";
import { collectSecCompanyFacts } from "./sec-company-facts-collector";
import { persistSecCompanyFacts, type SecCompanyFactsWriters } from "./sec-company-facts-persistence";
import { syncSecCompanyFacts } from "./sec-company-facts-sync";

const fullResponse = {
  cik: "0000320193",
  entityName: "Example Corp",
  facts: {
    "us-gaap": {
      Assets: {
        label: "Assets",
        description: "All assets",
        units: { USD: [{ end: "2025-12-31", val: 123, accn: "0000000000-25-000001", fy: 2025, fp: "FY", form: "10-K", filed: "2026-02-01", frame: "CY2025" }] },
      },
    },
    "dei": { EntityCommonStockSharesOutstanding: { label: "Shares", units: { shares: [{ val: 42 }] } } },
    "custom": { ProprietaryTag: { label: "Custom", units: { USD: [{ val: 9 }] } } },
  },
  extraSecField: { nested: ["preserve", 7] },
};

const success = (rawText = JSON.stringify(fullResponse)) => ({
  ok: true as const,
  status: 200,
  url: "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
  data: fullResponse,
  rawText,
  fetchedAt: "2026-09-26T00:00:00.000Z",
  responseHeaders: { "content-type": "application/json", etag: '"abc"' },
});

describe("SEC Company Facts pipeline", () => {
  it("collects a normalized CIK and preserves the complete response body and parsed fields", async () => {
    const fetchJson = vi.fn(async () => success());
    const collected = await collectSecCompanyFacts("3193", fetchJson);
    expect(fetchJson).toHaveBeenCalledWith("/api/xbrl/companyfacts/CIK0000003193.json");
    expect(collected).toMatchObject({ ok: true, cik: "0000003193", rawText: JSON.stringify(fullResponse), data: fullResponse });
  });

  it("rejects empty or overlong CIKs without making a request", async () => {
    const fetchJson = vi.fn();
    await expect(collectSecCompanyFacts("", fetchJson)).resolves.toMatchObject({ ok: false, error: "invalid_cik" });
    await expect(collectSecCompanyFacts("12345678901", fetchJson)).resolves.toMatchObject({ ok: false, error: "invalid_cik" });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it("persists every parsed field and the exact raw response with SEC metadata", async () => {
    const source = success(JSON.stringify(fullResponse));
    const archive = vi.fn(async () => 73);
    const upsertSnapshot = vi.fn(async () => undefined);
    const writers: SecCompanyFactsWriters = { archive, upsertSnapshot };
    await expect(persistSecCompanyFacts(source, "3193", writers)).resolves.toMatchObject({ cik: "0000003193", archivedId: 73 });
    expect(archive).toHaveBeenCalledWith({
      sourceType: "COMPANY_FACTS",
      sourceKey: "0000003193",
      url: source.url,
      status: 200,
      responseHeaders: source.responseHeaders,
      rawPayload: source.rawText,
      fetchedAt: source.fetchedAt,
    });
    expect(upsertSnapshot).toHaveBeenCalledWith({ cik: "0000003193", payload: fullResponse, fetchedAt: new Date(source.fetchedAt) });
  });

  it("orchestrates fetch then save and returns a compact run summary", async () => {
    const fetchJson = vi.fn(async () => success());
    const archive = vi.fn(async () => "snapshot-1");
    const upsertSnapshot = vi.fn(async () => undefined);
    await expect(syncSecCompanyFacts("3193", { fetchJson, writers: { archive, upsertSnapshot } })).resolves.toMatchObject({
      ok: true,
      cik: "0000003193",
      status: 200,
      archivedId: "snapshot-1",
      factCount: 3,
    });
    expect(fetchJson).toHaveBeenCalledOnce();
    expect(archive).toHaveBeenCalledOnce();
    expect(upsertSnapshot).toHaveBeenCalledOnce();
  });

  it("does not persist when SEC collection fails", async () => {
    const fetchJson = vi.fn(async () => ({ ok: false as const, status: 503, url: "https://data.sec.gov", error: "SEC HTTP 503", rawText: "unavailable", fetchedAt: "2026-09-26T00:00:00.000Z" }));
    const archive = vi.fn();
    const upsertSnapshot = vi.fn();
    await expect(syncSecCompanyFacts("3193", { fetchJson, writers: { archive, upsertSnapshot } })).resolves.toMatchObject({ ok: false, status: 503 });
    expect(archive).not.toHaveBeenCalled();
    expect(upsertSnapshot).not.toHaveBeenCalled();
  });
});
