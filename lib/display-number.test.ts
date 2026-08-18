import { describe, expect, it } from "vitest";
import { formatDisplayCurrency, formatDisplayInteger, formatDisplayNumber, formatDisplayPercent, formatDisplaySigned } from "@/lib/display-number";

describe("display number formatting", () => {
  it("limits visible decimals to two and groups thousands", () => {
    expect(formatDisplayNumber(1234.567)).toBe("1,234.57");
    expect(formatDisplayNumber(1234.5)).toBe("1,234.5");
  });
  it("handles common display variants and missing values", () => {
    expect(formatDisplayPercent(1.236)).toBe("1.24%");
    expect(formatDisplaySigned(-1.236, "%")).toBe("-1.24%");
    expect(formatDisplaySigned(1.236, "%")).toBe("+1.24%");
    expect(formatDisplayInteger(1234.8, "주")).toBe("1,235주");
    expect(formatDisplayCurrency(12.345)).toBe("$12.35");
    expect(formatDisplayNumber(null)).toBe("-");
    expect(formatDisplayNumber(Number.NaN)).toBe("-");
  });
});
