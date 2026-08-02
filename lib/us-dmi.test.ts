import { describe, expect, it } from "vitest";
import { latestDmi } from "./us-dmi";

describe("daily DMI", () => {
  it("returns directional values for a rising series", () => {
    const candles = Array.from({ length: 20 }, (_, i) => ({ date: `202607${String(i + 1).padStart(2, "0")}`, high: 10 + i, low: 8 + i, close: 9 + i }));
    const value = latestDmi(candles, 14);
    expect(value).not.toBeNull();
    expect(value!.plusDi).toBeGreaterThan(value!.minusDi);
    expect(value!.adx).toBeGreaterThanOrEqual(0);
  });
});
