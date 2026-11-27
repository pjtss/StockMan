import { describe, expect, it } from "vitest";
import { buildJournalArgs, classifyJournalError, parseServerJournalOptions, parseServerJournalOutput, redactServerLogMessage } from "./server-journal";

describe("systemd server journal diagnostics", () => {
  it("accepts only bounded lookbacks, line counts, and whitelisted units", () => {
    expect(parseServerJournalOptions(new URLSearchParams("logUnit=stockman.service&logUnit=nginx.service&logMinutes=45&logLimit=20"))).toEqual({
      units: ["stockman.service", "nginx.service"], minutes: 45, limit: 20,
    });
    expect(parseServerJournalOptions(new URLSearchParams("logUnit=../etc/passwd"))).toBeNull();
    expect(parseServerJournalOptions(new URLSearchParams("logMinutes=1441"))).toBeNull();
    expect(parseServerJournalOptions(new URLSearchParams("logLimit=101"))).toBeNull();
    expect(parseServerJournalOptions(new URLSearchParams("logMinutes=1e3"))).toBeNull();
  });

  it("normalizes journal timestamps and severity while redacting credentials", () => {
    const result = parseServerJournalOutput(JSON.stringify({
      __REALTIME_TIMESTAMP: "1795735500000000",
      PRIORITY: "3",
      MESSAGE: "Authorization: Bearer abcdefghijk DATABASE_URL=postgres://app:supersecret@db.local/x x-cron-secret=do-not-show",
    }));
    expect(result.invalidLineCount).toBe(0);
    expect(result.entries[0]).toMatchObject({ timestamp: "2026-11-26T23:25:00.000Z", priority: "ERROR" });
    expect(result.entries[0].message).toContain("Bearer [REDACTED]");
    expect(result.entries[0].message).toContain("DATABASE_URL=[REDACTED]");
    expect(result.entries[0].message).toContain("x-cron-secret=[REDACTED]");
    expect(result.entries[0].message).not.toContain("supersecret");
    expect(result.entries[0].message).not.toContain("do-not-show");
  });

  it("bounds messages and omits malformed JSON lines", () => {
    const parsed = parseServerJournalOutput(`${JSON.stringify({ MESSAGE: "x".repeat(2_000) })}\nnot-json`);
    expect(parsed.entries[0].message).toHaveLength(1_500);
    expect(parsed.invalidLineCount).toBe(1);
  });

  it("redacts webhook URLs and multiline control characters", () => {
    expect(redactServerLogMessage("failed https://discord.com/api/webhooks/123/secret\nnext line"))
      .toBe("failed [WEBHOOK_URL_REDACTED] next line");
  });

  it("redacts private key blocks before removing line breaks", () => {
    expect(redactServerLogMessage("key=-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----"))
      .toBe("key=[PRIVATE_KEY_REDACTED]");
  });

  it("builds fixed unit and access-log filters without shell fragments", () => {
    expect(buildJournalArgs("stockman.service", "2026-11-27T00:00:00.000Z", 5)).toContain("--unit=stockman.service");
    expect(buildJournalArgs("nginx-access", "2026-11-27T00:00:00.000Z", 5)).toContain("--identifier=stockman-nginx-access");
    expect(buildJournalArgs("stockman.service", "2026-11-27T00:00:00.000Z", 5)).toEqual([
      "--no-pager", "--quiet", "--output=json", "--utc", "--boot", "--lines=100", "--unit=stockman.service",
    ]);
    expect(buildJournalArgs("nginx-access", "2026-11-27T00:00:00.000Z", 100)).toContain("--lines=400");
  });

  it("classifies journal command failures without returning their raw detail", () => {
    expect(classifyJournalError(Object.assign(new Error("private path"), { code: "ENOENT" }), "secret stderr")).toBe("JOURNALCTL_UNAVAILABLE");
    expect(classifyJournalError(Object.assign(new Error("permission denied: private path"), { code: "EACCES" }), "secret stderr")).toBe("JOURNAL_ACCESS_DENIED");
    expect(classifyJournalError(Object.assign(new Error("timed out"), { killed: true }), "secret stderr")).toBe("JOURNAL_READ_TIMEOUT");
    expect(classifyJournalError(new Error("private path"), "secret stderr")).toBe("JOURNAL_READ_FAILED");
  });
});
