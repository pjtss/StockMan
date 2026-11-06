import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isCronRequestAuthorized: vi.fn(),
  analyzeSecSubmission: vi.fn(),
  collectMissingSecCompanyDocuments: vi.fn(),
  loadPendingSecEvents: vi.fn(),
  loadPendingSecRssIssuerCiks: vi.fn(),
  loadPendingSecRssIssuerCandidates: vi.fn(),
  loadRecentSecSubmissions: vi.fn(),
  markSecEventDiscord: vi.fn(),
  retryFailedSecCodexAnalyses: vi.fn(),
  syncSecCompany: vi.fn(),
  syncSecRssCandidateSubmissions: vi.fn(),
  syncSecCompanyFacts: vi.fn(),
  withAutomationRun: vi.fn(),
  loadFeatureDiscordWebhook: vi.fn(),
  loadFeatureModuleSettings: vi.fn(),
  isWithinSchedule: vi.fn(),
  resolveSecEdgarRuntimeConfig: vi.fn(),
  describeError: vi.fn(),
  isSchemaError: vi.fn(),
  recordSkippedAutomationRun: vi.fn(),
  loadSecSmallcapTickerTargets: vi.fn(),
  materializeStockmanSecEvents: vi.fn(),
  classifyStockmanEventError: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: mocks.isCronRequestAuthorized }));
vi.mock("@/lib/sec-edgar-repository", () => ({
  analyzeSecSubmission: mocks.analyzeSecSubmission,
  collectMissingSecCompanyDocuments: mocks.collectMissingSecCompanyDocuments,
  loadPendingSecEvents: mocks.loadPendingSecEvents,
  loadPendingSecRssIssuerCiks: mocks.loadPendingSecRssIssuerCiks,
  loadPendingSecRssIssuerCandidates: mocks.loadPendingSecRssIssuerCandidates,
  loadRecentSecSubmissions: mocks.loadRecentSecSubmissions,
  markSecEventDiscord: mocks.markSecEventDiscord,
  retryFailedSecCodexAnalyses: mocks.retryFailedSecCodexAnalyses,
  syncSecCompany: mocks.syncSecCompany,
  syncSecRssCandidateSubmissions: mocks.syncSecRssCandidateSubmissions,
  syncSecCompanyFacts: mocks.syncSecCompanyFacts,
}));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: mocks.withAutomationRun }));
vi.mock("@/lib/discord-config", () => ({ loadFeatureDiscordWebhook: mocks.loadFeatureDiscordWebhook }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: mocks.loadFeatureModuleSettings }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: mocks.isWithinSchedule }));
vi.mock("@/lib/sec-edgar-config", () => ({ resolveSecEdgarRuntimeConfig: mocks.resolveSecEdgarRuntimeConfig }));
vi.mock("@/lib/error-diagnostics", () => ({ describeError: mocks.describeError, isSchemaError: mocks.isSchemaError }));
vi.mock("@/lib/automation-run-repository", () => ({ recordSkippedAutomationRun: mocks.recordSkippedAutomationRun }));
vi.mock("@/lib/sec-smallcap-universe", () => ({ loadSecSmallcapTickerTargets: mocks.loadSecSmallcapTickerTargets }));
vi.mock("@/lib/stockman-events", () => ({
  classifyStockmanEventError: mocks.classifyStockmanEventError,
  materializeStockmanSecEvents: mocks.materializeStockmanSecEvents,
}));

import { POST } from "./route";

const CIK_A = "0000000001";
const CIK_B = "0000000002";
const ACCESSION_A = "0000000001-26-000001";
const ACCESSION_B = "0000000002-26-000002";
const runtime = (overrides = {}) => ({ ciks: [], smallcapUniverse: false, syncXbrl: false, discordBatch: 10, ...overrides });

describe("POST /api/cron/sec-edgar RSS candidate coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isCronRequestAuthorized.mockReturnValue(true);
    mocks.withAutomationRun.mockImplementation(async (_module: string, task: () => Promise<unknown>) => task());
    mocks.loadFeatureModuleSettings.mockResolvedValue({ enabled: true, featureSettings: {} });
    mocks.isWithinSchedule.mockReturnValue(true);
    mocks.resolveSecEdgarRuntimeConfig.mockReturnValue(runtime());
    mocks.retryFailedSecCodexAnalyses.mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 });
    mocks.loadPendingSecRssIssuerCiks.mockResolvedValue([]);
    mocks.loadPendingSecRssIssuerCandidates.mockResolvedValue([]);
    mocks.syncSecCompany.mockImplementation(async (cik: string) => ({ ok: true, cik, submissions: 1, inserted: 1 }));
    mocks.syncSecRssCandidateSubmissions.mockImplementation(async (cik: string) => ({ ok: true, cik, submissions: 1, inserted: 1, unmatchedAccessions: [] }));
    mocks.syncSecCompanyFacts.mockResolvedValue({ ok: true });
    mocks.collectMissingSecCompanyDocuments.mockResolvedValue({ failed: [] });
    mocks.materializeStockmanSecEvents.mockResolvedValue({ status: "SUCCESS", fetched: 0, stored: 0, unverified: 0, failed: 0 });
    mocks.loadFeatureDiscordWebhook.mockResolvedValue(null);
    mocks.loadPendingSecEvents.mockResolvedValue([]);
    mocks.loadRecentSecSubmissions.mockResolvedValue([]);
    mocks.describeError.mockReturnValue({ errorCode: "DATABASE_ERROR" });
    mocks.isSchemaError.mockReturnValue(false);
  });

  it("syncs RSS candidates with Submissions metadata only", async () => {
    mocks.loadPendingSecRssIssuerCandidates.mockResolvedValue([{ cik: CIK_A, accessions: [ACCESSION_A] }]);
    mocks.resolveSecEdgarRuntimeConfig.mockReturnValue(runtime({ syncXbrl: true }));

    const response = await POST(new Request("https://stockman.example/api/cron/sec-edgar", { method: "POST", headers: { "x-cron-secret": "valid" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.secEdgar.submissionCoverage).toMatchObject({ candidateLookupOk: true, candidateCikCount: 1, rssOnlyCikCount: 1, fetchSuccessCikCount: 1, fetchFailureCikCount: 0, submissionCount: 1, insertedSubmissionCount: 1 });
    expect(body.secEdgar.results[0]).toMatchObject({ cik: CIK_A, scope: "SEC_RSS_CANDIDATE" });
    expect(mocks.syncSecRssCandidateSubmissions).toHaveBeenCalledWith(CIK_A, [ACCESSION_A]);
    expect(mocks.loadPendingSecRssIssuerCandidates).toHaveBeenCalledWith(5, 10);
    expect(mocks.materializeStockmanSecEvents).toHaveBeenCalledWith(500, undefined, [ACCESSION_A]);
    expect(mocks.syncSecCompany).not.toHaveBeenCalled();
    expect(mocks.syncSecCompanyFacts).not.toHaveBeenCalled();
    expect(mocks.collectMissingSecCompanyDocuments).not.toHaveBeenCalled();
  });

  it("deduplicates configured and RSS CIKs and keeps extended collection configured-only", async () => {
    mocks.resolveSecEdgarRuntimeConfig.mockReturnValue(runtime({ ciks: [CIK_A], syncXbrl: true }));
    mocks.loadPendingSecRssIssuerCandidates.mockResolvedValue([{ cik: CIK_A, accessions: [ACCESSION_A] }, { cik: CIK_B, accessions: [ACCESSION_B] }]);

    const response = await POST(new Request("https://stockman.example/api/cron/sec-edgar", { method: "POST", headers: { "x-cron-secret": "valid" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissionCoverage).toMatchObject({ configuredCikCount: 1, fetchSuccessCikCount: 1, fetchFailureCikCount: 0 });
    expect(body.secEdgar.submissionCoverage).toMatchObject({ candidateCikCount: 2, rssOnlyCikCount: 1, fetchSuccessCikCount: 1 });
    expect(mocks.syncSecRssCandidateSubmissions).toHaveBeenCalledWith(CIK_B, [ACCESSION_B]);
    expect(mocks.materializeStockmanSecEvents).toHaveBeenNthCalledWith(1, 500, undefined, [ACCESSION_B]);
    expect(mocks.materializeStockmanSecEvents).toHaveBeenNthCalledWith(2);
    expect(mocks.syncSecCompany.mock.calls.map(([cik]) => cik)).toEqual([CIK_A]);
    expect(mocks.syncSecCompanyFacts.mock.calls.map(([cik]) => cik)).toEqual([CIK_A]);
    expect(mocks.collectMissingSecCompanyDocuments.mock.calls.map(([cik]) => cik)).toEqual([CIK_A]);
    expect(body.results.map((result: { scope: string }) => result.scope)).toEqual(["CONFIGURED"]);
  });

  it("runs the RSS issuer candidate schedule when configured SEC realtime is outside its schedule", async () => {
    mocks.isWithinSchedule.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mocks.loadPendingSecRssIssuerCandidates.mockResolvedValue([{ cik: CIK_A, accessions: [ACCESSION_A] }]);

    const response = await POST(new Request("https://stockman.example/api/cron/sec-edgar", { method: "POST", headers: { "x-cron-secret": "valid" } }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.secRealtime).toMatchObject({ skipped: true, reason: "outside_schedule" });
    expect(body.secEdgar.submissionCoverage).toMatchObject({ candidateLookupOk: true, candidateCikCount: 1, fetchSuccessCikCount: 1 });
    expect(mocks.syncSecRssCandidateSubmissions).toHaveBeenCalledWith(CIK_A, [ACCESSION_A]);
    expect(mocks.loadPendingSecRssIssuerCandidates).toHaveBeenCalledWith(5, 10);
    expect(mocks.materializeStockmanSecEvents).toHaveBeenCalledWith(500, undefined, [ACCESSION_A]);
    expect(mocks.syncSecCompanyFacts).not.toHaveBeenCalled();
    expect(mocks.collectMissingSecCompanyDocuments).not.toHaveBeenCalled();
  });

  it("does not query candidates outside the configured SEC schedule", async () => {
    mocks.isWithinSchedule.mockReturnValue(false);

    const response = await POST(new Request("https://stockman.example/api/cron/sec-edgar", { method: "POST", headers: { "x-cron-secret": "valid" } }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, skipped: true, reason: "outside_schedule" });
    expect(mocks.recordSkippedAutomationRun).toHaveBeenCalledWith("sec-realtime", "outside_schedule");
    expect(mocks.loadPendingSecRssIssuerCandidates).not.toHaveBeenCalled();
    expect(mocks.syncSecCompany).not.toHaveBeenCalled();
  });

  it("returns a failed request when candidate lookup fails instead of reporting zero new filings", async () => {
    mocks.loadPendingSecRssIssuerCandidates.mockRejectedValue(new Error("candidate lookup unavailable"));

    const response = await POST(new Request("https://stockman.example/api/cron/sec-edgar", { method: "POST", headers: { "x-cron-secret": "valid" } }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false, errorCode: "DATABASE_ERROR", secEdgar: { submissionCoverage: { candidateLookupOk: false } } });
    expect(mocks.syncSecCompany).not.toHaveBeenCalled();
  });
});
