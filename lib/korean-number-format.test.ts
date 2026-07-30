import { describe, expect, it } from "vitest";
import { formatKoreanCompact } from "./korean-number-format";

describe("formatKoreanCompact", () => {
  it("formats ten-thousand and hundred-million units", () => {
    expect(formatKoreanCompact(10_000)).toBe("1만");
    expect(formatKoreanCompact(12_500)).toBe("1.25만");
    expect(formatKoreanCompact(100_000_000)).toBe("1억");
    expect(formatKoreanCompact(125_000_000, " 달러")).toBe("1.25억 달러");
  });

  it("preserves missing and small values", () => {
    expect(formatKoreanCompact(null)).toBe("-");
    expect(formatKoreanCompact(1_234, "주")).toBe("-");
  });
});
