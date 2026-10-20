import { beforeEach, describe, expect, it, vi } from "vitest";

const state: any = vi.hoisted(() => ({
  latest: null,
  backoffSkip: null,
  backoffLookupCalls: 0,
  runResult: { ok: true },
  runCalls: 0,
  skipped: [] as string[],
}));

vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: () => true }));
vi.mock("@/lib/feature-module-settings", () => ({ loadFeatureModuleSettings: async () => ({ enabled: true, intervalSeconds: 86400 }) }));
vi.mock("@/lib/schedule-time", () => ({ isWithinSchedule: () => true }));
vi.mock("@/lib/automation-run-repository", () => ({
  loadLatestExecutedAutomationRun: async () => state.latest,
  loadLatestInstrumentFundamentalBackoffSkip: async () => { state.backoffLookupCalls++; return state.backoffSkip; },
  recordSkippedAutomationRun: async (_key: string, reason: string) => { state.skipped.push(reason); },
}));
vi.mock("@/lib/instrument-fundamentals", () => ({ refreshInstrumentFundamentals: async () => state.runResult }));
vi.mock("@/lib/automation-run", () => ({ withAutomationRun: async (_key: string, task: () => Promise<unknown>) => { state.runCalls++; return task(); } }));

import { POST } from "./route";

const post = () => POST(new Request("http://localhost/api/cron/instrument-fundamentals", { method: "POST" }));

beforeEach(() => {
  state.latest = null;
  state.backoffSkip = null;
  state.backoffLookupCalls = 0;
  state.runResult = { ok: true };
  state.runCalls = 0;
  state.skipped = [];
});

describe("instrument fundamentals cron retry policy", () => {
  it("allows a retry after the failure cooldown for a prior partial run", async () => {
    state.latest = { status: "PARTIAL", started_at: new Date(Date.now() - 3700_000).toISOString() };
    state.runResult = { ok: false };

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false });
    expect(state.runCalls).toBe(1);
  });

  it("does not repeat a successful daily refresh before its configured interval", async () => {
    state.latest = { status: "SUCCESS", started_at: new Date(Date.now() - 3600_000).toISOString() };

    const response = await post();

    expect(await response.json()).toMatchObject({ skipped: true, reason: "outside_interval", intervalSeconds: 86400 });
    expect(state.runCalls).toBe(0);
    expect(state.backoffLookupCalls).toBe(0);
  });

  it("throttles full-scope rebuilds after a retry-backoff skip but preserves the retry deadline", async () => {
    state.latest = { status: "PARTIAL", started_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString() };
    state.backoffSkip = {
      started_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      next_retry_at: new Date(Date.now() + 3 * 60 * 60_000).toISOString().replace("T", " ").replace("Z", "+00"),
    };

    const response = await post();

    const result = await response.json();
    expect(result).toMatchObject({ skipped: true, reason: "instrument_retry_backoff_cooldown" });
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(3290);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(3300);
    expect(state.skipped).toContain("instrument_retry_backoff_cooldown");
    expect(state.backoffLookupCalls).toBe(1);
    expect(state.runCalls).toBe(0);
  });

  it("starts the refresh on the first cron tick at or after the persisted retry deadline", async () => {
    state.latest = { status: "PARTIAL", started_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString() };
    state.backoffSkip = {
      started_at: new Date(Date.now() - 60 * 60_000).toISOString(),
      next_retry_at: new Date(Date.now() - 1_000).toISOString(),
    };

    const response = await post();

    expect(await response.json()).toEqual({ ok: true });
    expect(state.runCalls).toBe(1);
  });

  it("does not start a second refresh while the previous execution is running", async () => {
    state.latest = { status: "RUNNING", started_at: new Date(Date.now() - 60_000).toISOString() };

    const response = await post();

    expect(await response.json()).toMatchObject({ skipped: true, reason: "already_running" });
    expect(state.runCalls).toBe(0);
  });

  it("continues protecting a long-running refresh beyond two hours", async () => {
    state.latest = { status: "RUNNING", started_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString() };

    const response = await post();

    expect(await response.json()).toMatchObject({ skipped: true, reason: "already_running" });
    expect(state.runCalls).toBe(0);
  });

  it("fails closed when the prior-run status lookup cannot be trusted", async () => {
    state.latest = { status: "SUCCESS", started_at: "invalid timestamp" };

    const response = await post();

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "INVALID_LAST_RUN_TIMESTAMP" });
    expect(state.runCalls).toBe(0);
  });
});
