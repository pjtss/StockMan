import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ finished: [] as Array<{ status: string; summary: Record<string, unknown> }> }));

vi.mock("@/lib/automation-run-repository", () => ({
  finishAutomationRun: async (_id: number, status: string, summary: Record<string, unknown>) => { state.finished.push({ status, summary }); },
  recordDebugRunItems: async () => 0,
  startAutomationRun: async () => 1,
}));
vi.mock("@/lib/request-trace", () => ({ readRequestTrace: async () => null }));
vi.mock("@/lib/automation-completion-discord", () => ({ notifyAutomationCompletion: async () => ({ sent: false, skipped: true }) }));

import { compactAutomationSummary, withAutomationRun } from "./automation-run";

beforeEach(() => { state.finished = []; });

describe("automation run result status", () => {
  it("persists partial provider failures as PARTIAL rather than SUCCESS", async () => {
    await withAutomationRun("instrument-fundamentals", async () => ({ ok: false, instrumentCount: 10, successCount: 9, failureCount: 1 }));
    expect(state.finished.at(-1)?.status).toBe("PARTIAL");
  });

  it("persists a complete failure as FAILED", async () => {
    await withAutomationRun("instrument-fundamentals", async () => ({ ok: false, instrumentCount: 10, successCount: 0, failureCount: 10 }));
    expect(state.finished.at(-1)?.status).toBe("FAILED");
  });

  it("retains SUCCESS for a fully successful result", async () => {
    await withAutomationRun("instrument-fundamentals", async () => ({ ok: true, instrumentCount: 10, successCount: 10, failureCount: 0 }));
    expect(state.finished.at(-1)?.status).toBe("SUCCESS");
  });

  it("records advisory-lock contention as SKIPPED, not a successful refresh", async () => {
    await withAutomationRun("instrument-fundamentals", async () => ({ ok: true, skipped: true, reason: "already_running" }));
    expect(state.finished.at(-1)?.status).toBe("SKIPPED");
    expect(state.finished.at(-1)?.summary.notifications).toMatchObject({ completion: { skipped: true, reason: "already_running" } });
  });
});

describe("automation run summary compaction", () => {
  it("stores array counts and only a small sample", () => {
    expect(compactAutomationSummary({ results: [{ ticker: "A" }, { ticker: "B" }, { ticker: "C" }, { ticker: "D" }] })).toEqual({
      results: { count: 4, sample: [{ ticker: "A" }, { ticker: "B" }, { ticker: "C" }] },
    });
  });

  it("limits oversized strings", () => {
    const value = compactAutomationSummary({ raw: "x".repeat(2_100) }) as { raw: string };
    expect(value.raw.length).toBe(2_001);
    expect(value.raw.endsWith("…")).toBe(true);
  });
});
