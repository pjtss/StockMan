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
    expect(run).toMatchObject({ id: 42, moduleKey: "us-obv", durationMs: 1250, errorMessage: "KIS failed", summary: { error: "KIS failed" } });
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
  });
});
