import { describe, expect, it } from "vitest";
import { boundedIntegerQuery } from "./query-params";

describe("boundedIntegerQuery", () => {
  it("truncates fractions and clamps values to inclusive bounds", () => {
    expect(boundedIntegerQuery("3.9", 7, 1, 31)).toBe(3);
    expect(boundedIntegerQuery("999", 7, 1, 31)).toBe(31);
    expect(boundedIntegerQuery("-2", 7, 1, 31)).toBe(1);
  });

  it("uses its fallback for missing, blank, zero, and non-finite values", () => {
    for (const raw of [null, "", "  ", "0", "NaN", "Infinity"]) {
      expect(boundedIntegerQuery(raw, 7, 1, 31)).toBe(7);
    }
  });
});
