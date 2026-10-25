import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  isCronRequestAuthorized: vi.fn(),
  query: vi.fn(),
  loadFeatureModuleSettings: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: state.requireAdminSession }));
vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: state.isCronRequestAuthorized }));
vi.mock("@/lib/db", () => ({ getPool: () => ({ query: state.query }) }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: state.loadFeatureModuleSettings }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: () => true }));
vi.mock("@/lib/schema-health", () => ({ inspectDatabaseSchema: vi.fn() }));

import { GET } from "./route";

describe("admin RSS translation diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.requireAdminSession.mockResolvedValue(true);
    state.isCronRequestAuthorized.mockReturnValue(false);
    state.loadFeatureModuleSettings.mockResolvedValue({
      enabled: true,
      startTime: "00:00",
      endTime: "23:59",
      activeDays: [0, 1, 2, 3, 4, 5, 6],
      scheduleMode: "weekly-range",
      startDay: 1,
      endDay: 1,
    });
    state.query.mockImplementation(async (query: string) => {
      if (query.includes("translation_candidate_title")) return { rows: [{
        id: 123,
        source: "STOCKTITAN",
        title: "Third Quarter 2026 results\nOriginal headline",
        candidate_title: "3분기 2026 결과\n번역 후보",
        reason: "translation_numeric_hallucination",
        attempts: 3,
        updated_at: new Date("2026-10-25T04:00:00.000Z"),
      }] };
      if (query.includes("DISTINCT ON (source)")) return { rows: [] };
      if (query.includes("automation_runs")) return { rows: [] };
      if (query.includes("notification_pending")) return { rows: [
        { source: "GLOBENEWSWIRE", total: 2, translation_pending: 2, translated: 0, translation_failed: 0, translation_skipped: 0, notification_pending: 2, sent: 0, notification_failed: 0, in_flight: 0 },
        { source: "SEC_EDGAR", total: 5, translation_pending: 2, translated: 2, translation_failed: 0, translation_skipped: 1, notification_pending: 2, sent: 3, notification_failed: 0, in_flight: 0 },
        { source: "STOCKTITAN", total: 4, translation_pending: 1, translated: 2, translation_failed: 0, translation_skipped: 1, notification_pending: 1, sent: 3, notification_failed: 0, in_flight: 0 },
      ] };
      if (query.includes("GROUP BY source")) return { rows: [] };
      if (query.includes("COUNT(*)::text")) return { rows: [{ count: "1" }] };
      return { rows: [] };
    });
  });

  it("requires administrator or cron authentication before reading candidate headlines", async () => {
    state.requireAdminSession.mockResolvedValue(false);
    state.isCronRequestAuthorized.mockReturnValue(false);

    const response = await GET(new Request("https://example.test/api/admin/debug-suite?checks=rss"));

    expect(response.status).toBe(401);
    expect(state.query).not.toHaveBeenCalled();
  });

  it("returns bounded failed translation candidates to the authorized RSS diagnostic", async () => {
    const response = await GET(new Request("https://example.test/api/admin/debug-suite?checks=rss"));
    const body = await response.json();
    const sampleQuery = state.query.mock.calls.find(([query]) => String(query).includes("translation_candidate_title"));

    expect(response.status).toBe(200);
    expect(body.result.rss.translationFailureSamples).toEqual([{
      articleId: "123",
      source: "STOCKTITAN",
      title: "Third Quarter 2026 results Original headline",
      candidateTitle: "3분기 2026 결과 번역 후보",
      reason: "translation_numeric_hallucination",
      attempts: 3,
      updatedAt: new Date("2026-10-25T04:00:00.000Z").toISOString(),
    }]);
    expect(body.result.rss.articleFlowBySource).toMatchObject([
      { source: "GLOBENEWSWIRE", total: 2, notification_pending: 2, sent: 0 },
      { source: "SEC_EDGAR", total: 5, notification_pending: 2, sent: 3 },
      { source: "STOCKTITAN", total: 4, notification_pending: 1, sent: 3 },
    ]);
    expect(String(sampleQuery?.[0])).toContain("translation_candidate_title IS NOT NULL");
    expect(String(sampleQuery?.[0])).toContain("LIMIT 20");
    expect(sampleQuery?.[1]).toEqual([
      ["GLOBENEWSWIRE", "STOCKTITAN", "SEC_EDGAR"],
      ["translation_numeric_hallucination", "translation_output_incomplete", "target_language_not_detected"],
    ]);
  });
});
