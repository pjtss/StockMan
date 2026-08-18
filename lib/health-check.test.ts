import { describe, expect, it } from "vitest";
import { getAutomationCoverage } from "./health-check";

describe("automation coverage", () => {
  it("identifies registered modules without execution history", () => {
    expect(getAutomationCoverage(["a", "b", "c"], ["b", "unknown"])).toEqual({
      expected: ["a", "b", "c"],
      observed: ["b"],
      neverRun: ["a", "c"],
    });
  });
});
