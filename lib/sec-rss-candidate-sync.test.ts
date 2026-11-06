import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const onConflictDoUpdate = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({ onConflictDoUpdate }));
  const insert = vi.fn(() => ({ values }));
  return {
    fetchSecSubmissions: vi.fn(),
    archiveSecSourceSnapshot: vi.fn(),
    classifySecEvent: vi.fn(),
    getDb: vi.fn(() => ({ insert })),
    insert,
    values,
    onConflictDoUpdate,
  };
});

vi.mock("./db", () => ({ getDb: mocks.getDb, getPool: vi.fn() }));
vi.mock("./sec-submissions", () => ({ fetchAllSecSubmissions: vi.fn(), fetchSecSubmissions: mocks.fetchSecSubmissions }));
vi.mock("./source-payload-archive", () => ({ archiveSecSourceSnapshot: mocks.archiveSecSourceSnapshot, archiveSecFilingDocument: vi.fn() }));
vi.mock("./sec-event-classifier", () => ({ classifySecEvent: mocks.classifySecEvent }));
vi.mock("./sec-company-facts-sync", () => ({ syncSecCompanyFacts: vi.fn() }));

import { syncSecRssCandidateSubmissions } from "./sec-edgar-repository";

const CIK = "0000001234";
const MATCH = "0000001234-26-000001";
const NOT_MATCHED = "0000001234-26-000002";
const row = (accession: string, filingDate: string) => ({
  accession, filingDate, form: "8-K", primaryDocument: "main.htm", primaryDocDescription: "Current report",
});

describe("SEC RSS accession-only Submissions sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchSecSubmissions.mockResolvedValue({
      cik: CIK,
      name: "Example Corp",
      tickers: ["EXM"],
      exchanges: ["Nasdaq"],
      source: { ok: true, status: 200, url: "https://data.sec.gov/submissions/CIK0000001234.json", rawText: "{raw}", fetchedAt: "2026-11-06T17:00:00.000Z", responseHeaders: {} },
      filings: [row(MATCH, "2026-11-06"), row("0000001234-26-000003", "2026-11-05")],
    });
    mocks.archiveSecSourceSnapshot.mockResolvedValue(10);
    mocks.classifySecEvent.mockReturnValue({ category: "CONTRACT", direction: "POSITIVE", score: 8, matchedTerms: ["agreement"] });
  });

  it("fetches recent metadata once and persists only exact RSS accession matches", async () => {
    const result = await syncSecRssCandidateSubmissions(CIK, [MATCH, NOT_MATCHED]);

    expect(result).toMatchObject({ ok: true, cik: CIK, submissions: 1, inserted: 1, unmatchedAccessions: [NOT_MATCHED] });
    expect(mocks.fetchSecSubmissions).toHaveBeenCalledWith(CIK);
    expect(mocks.archiveSecSourceSnapshot).toHaveBeenCalledOnce();
    expect(mocks.insert).toHaveBeenCalledTimes(3);
    const insertedSubmissions = mocks.values.mock.calls[1][0];
    expect(insertedSubmissions).toHaveLength(1);
    expect(insertedSubmissions[0]).toMatchObject({ accession: MATCH, cik: CIK, form: "8-K" });
    const insertedEvents = mocks.values.mock.calls[2][0];
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]).toMatchObject({ accession: MATCH, cik: CIK });
  });

  it("does not write company or filing data when SEC fetch fails", async () => {
    mocks.fetchSecSubmissions.mockResolvedValue({ cik: CIK, filings: [], source: { ok: false, status: 503, error: "SEC unavailable", rawText: "", fetchedAt: "2026-11-06T17:00:00.000Z" } });
    const result = await syncSecRssCandidateSubmissions(CIK, [MATCH]);
    expect(result).toMatchObject({ ok: false, submissions: 0, inserted: 0, unmatchedAccessions: [MATCH] });
    expect(mocks.archiveSecSourceSnapshot).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
