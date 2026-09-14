import { describe, expect, it } from "vitest";
import { parseUsMinuteTurnoverPoints } from "./kis-us-minute-turnover";

describe("KIS US minute turnover parsing", () => {
  it("does not treat cumulative volume as minute volume", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", tvol: "100000", tamnt: "1000000" }] });
    expect(point.volume).toBeUndefined();
  });

  it("keeps incremental evol for MVP turnover", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", evol: "25", tvol: "100000" }] });
    expect(point.volume).toBe(25);
  });
});
