import { describe, expect, it } from "vitest";
import { chooseTopRisingRows } from "./us-top-rising-universe";

describe("US TOP rising response selection", () => {
  it("prefers the full VOL_RANG=0 page when KIS returns a successful partial page", () => {
    const primary = { output2: [{ symb: "SSM" }, { symb: "CPOP" }] };
    const fallback = { output2: Array.from({ length: 100 }, (_, index) => ({ symb: `T${index}` })) };

    const result = chooseTopRisingRows(primary, fallback);

    expect(result.fallbackUsed).toBe(true);
    expect(result.rows).toHaveLength(100);
  });

  it("keeps a complete primary page without replacing it", () => {
    const primary = { output2: Array.from({ length: 100 }, (_, index) => ({ symb: `T${index}` })) };
    const fallback = { output2: [{ symb: "OTHER" }] };

    const result = chooseTopRisingRows(primary, fallback);

    expect(result.fallbackUsed).toBe(false);
    expect(result.rows).toEqual(primary.output2);
  });
});
