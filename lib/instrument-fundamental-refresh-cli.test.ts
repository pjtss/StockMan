import { describe, expect, it } from "vitest";
import { parseInstrumentFundamentalRefreshCli } from "./instrument-fundamental-refresh-cli";

const fingerprint = "a".repeat(64);

describe("instrument fundamentals refresh CLI parser", () => {
  it("defaults to a read-only preview", () => {
    expect(parseInstrumentFundamentalRefreshCli([])).toMatchObject({ mode: "preview", apply: false });
  });

  it("accepts an explicitly confirmed full refresh", () => {
    expect(parseInstrumentFundamentalRefreshCli([
      "--apply", "--expect-total=7796", `--expect-total-fingerprint=${fingerprint}`,
    ])).toMatchObject({ mode: "apply-full", apply: true, expectedCount: 7796, expectedFingerprint: fingerprint });
  });

  it("accepts verify-only mode without write expectations", () => {
    expect(parseInstrumentFundamentalRefreshCli(["--verify-since=2026-09-25T21:19:28.030Z"]))
      .toMatchObject({ mode: "verify", apply: false, verifySince: new Date("2026-09-25T21:19:28.030Z") });
  });

  it("accepts fingerprint-confirmed targeted retries", () => {
    expect(parseInstrumentFundamentalRefreshCli([
      "--retry-invalid-since=2026-09-25T21:19:28.030Z", "--apply", "--expect-invalid=3",
      `--expect-invalid-fingerprint=${fingerprint}`,
    ])).toMatchObject({ mode: "retry-invalid", apply: true, expectedInvalid: 3, expectedInvalidFingerprint: fingerprint });
  });

  it.each([
    [["--apply", "--expect-total=0", `--expect-total-fingerprint=${fingerprint}`], "positive safe integer"],
    [["--apply", "--expect-total=3"], "64-character SHA-256"],
    [["--verify-since=2026-09-25T21:19:28.030Z", "--apply"], "cannot be combined"],
    [["--verify-since=2026-09-25T21:19:28.030Z", "--retry-invalid-since=2026-09-25T21:19:28.030Z"], "Choose only one"],
    [["--retry-missing-since=2026-09-25T21:19:28.030Z", "--apply", "--expect-invalid=1", `--expect-invalid-fingerprint=${fingerprint}`], "not valid for this refresh mode"],
    [["--retry-invalid-since=not-a-date"], "valid ISO timestamp"],
    [["--mystery"], "Unknown refresh CLI option"],
    [["--apply", "--apply", "--expect-total=1", `--expect-total-fingerprint=${fingerprint}`], "Duplicate CLI option"],
  ])("rejects unsafe CLI arguments %j", (argv, message) => {
    expect(() => parseInstrumentFundamentalRefreshCli(argv)).toThrow(message);
  });
});
