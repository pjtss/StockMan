import { describe, expect, it } from "vitest";
import { normalizeAutomationDebugRun, redactDebugValue } from "./automation-debug";

describe("automation debug diagnostics", () => {
  it("redacts credentials while preserving API raw payload fields", () => {
    expect(redactDebugValue({
      accessToken: "token",
      webhookUrl: "https://discord.example/webhook",
      response: { rt_cd: "0", output2: [{ code: "AAPL" }] },
    })).toEqual({
      accessToken: "[REDACTED]",
      webhookUrl: "[REDACTED]",
      response: { rt_cd: "0", output2: [{ code: "AAPL" }] },
    });
  });

  it("normalizes run timestamps, duration and optional summaries", () => {
    const run = normalizeAutomationDebugRun({
      id: "42",
      module_key: "us-obv",
      status: "FAILED",
      started_at: "2026-08-08T00:00:00.000Z",
      finished_at: "2026-08-08T00:00:01.250Z",
      duration_ms: "1250",
      summary: { error: "KIS failed" },
      error_message: "KIS failed",
    });
    expect(run).toMatchObject({ id: 42, moduleKey: "us-obv", durationMs: 1250, stale: false, errorMessage: "KIS failed", errorDiagnostics: { errorCode: "INTEGRATION_ERROR" }, summary: { error: "KIS failed" } });
    expect(normalizeAutomationDebugRun({
      id: 42,
      module_key: "us-obv",
      status: "SUCCESS",
      started_at: "2026-08-08T00:00:00.000Z",
      finished_at: null,
      duration_ms: null,
      summary: { response: { rawText: "raw" } },
      error_message: null,
    }, false).summary).toBeUndefined();

    const stale = normalizeAutomationDebugRun({
      id: 43,
      module_key: "us-obv",
      status: "RUNNING",
      started_at: "2026-08-08T00:00:00.000Z",
      finished_at: null,
      duration_ms: "901000",
      summary: {},
      error_message: null,
    });
    expect(stale.stale).toBe(true);

    const reconciled = normalizeAutomationDebugRun({
      id: 44,
      module_key: "us-obv",
      status: "FAILED",
      started_at: "2026-08-08T00:00:00.000Z",
      finished_at: "2026-08-08T00:16:00.000Z",
      duration_ms: "960000",
      summary: { diagnostics: { errorCode: "AUTOMATION_RUN_STALE", message: "worker stopped" } },
      error_message: "The worker stopped before finalizing the run",
    });
    expect(reconciled.errorDiagnostics).toMatchObject({ errorCode: "AUTOMATION_RUN_STALE" });
  });
});
