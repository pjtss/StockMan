import { describe, expect, it } from "vitest";
import { buildUsMinuteTurnoverUrl, parseUsMinuteTurnoverPoints } from "./kis-us-minute-turnover";

describe("KIS US minute turnover parsing", () => {
  it("uses the official overseas minute-candle query fields and requested exchange", () => {
    const url = new URL(buildUsMinuteTurnoverUrl("BIYA", "NAS", { AUTH: "", KEYB: "", FID_PW_DATA_INCU_YN: "N" } as any));
    expect(url.pathname).toBe("/uapi/overseas-price/v1/quotations/inquire-time-itemchartprice");
    expect(Object.fromEntries(url.searchParams)).toEqual({ AUTH: "", KEYB: "", EXCD: "NAS", SYMB: "BIYA", PINC: "N", NEXT: "", NREC: "120", FILL: "0", NMIN: "1" });
  });

  it("converts paired KIS Korea and exchange wall clocks to a real epoch", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20261007", khms: "172100", xymd: "20261007", xhms: "042100", last: "2.03", evol: "10" }] });
    expect(point.time).toBe("20261007T172100");
    expect(point.observedAt).toBe(Date.parse("2026-10-07T08:21:00.000Z"));
  });

  it("converts an exchange-only US wall clock with the correct daylight-saving offset", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ xymd: "20261007", xhms: "042100", last: "2.03", evol: "10" }] });
    expect(point.observedAt).toBe(Date.parse("2026-10-07T08:21:00.000Z"));
  });

  it("does not invent a source timestamp when KIS provides no parseable clock", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ last: "2.03", evol: "10" }] });
    expect(point.observedAt).toBeNull();
  });

  it("does not treat cumulative volume as minute volume", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", tvol: "100000", tamnt: "1000000" }] });
    expect(point.volume).toBeUndefined();
  });

  it("keeps incremental evol for MVP turnover", () => {
    const [point] = parseUsMinuteTurnoverPoints({ output: [{ kymd: "20260913", khms: "101000", last: "10", evol: "25", tvol: "100000" }] });
    expect(point.volume).toBe(25);
  });
});
