import { describe, expect, it } from "vitest";
import { compactAutomationSummary } from "./automation-run";

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
