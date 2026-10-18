import { describe, expect, it } from "vitest";
import { parseKisNullableNumber } from "./kis-kr-price-detail";

describe("KIS domestic quote numeric parsing", () => {
  it.each([undefined, null, "", "  ", "not-a-number"])("keeps absent or invalid provider values unknown: %s", (value) => {
    expect(parseKisNullableNumber(value)).toBeNull();
  });

  it("parses valid comma-separated values and preserves an actual numeric zero", () => {
    expect(parseKisNullableNumber("1,234,567")).toBe(1_234_567);
    expect(parseKisNullableNumber("0")).toBe(0);
  });
});
