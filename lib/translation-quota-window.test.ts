import { describe, expect, it } from "vitest";
import { getNextPacificQuotaDayStart, getPacificQuotaDayStart } from "./translation-quota-window";

describe("Google Cloud daily quota Pacific-time window", () => {
  it("finds current and next midnight across the spring DST transition", () => {
    const beforeSpringShift = new Date("2026-03-08T07:30:00.000Z"); // Mar 7, 23:30 PST
    expect(getPacificQuotaDayStart(beforeSpringShift)).toEqual(new Date("2026-03-07T08:00:00.000Z"));
    expect(getNextPacificQuotaDayStart(beforeSpringShift)).toEqual(new Date("2026-03-08T08:00:00.000Z"));

    const afterSpringShift = new Date("2026-03-08T11:00:00.000Z"); // Mar 8, 04:00 PDT
    expect(getPacificQuotaDayStart(afterSpringShift)).toEqual(new Date("2026-03-08T08:00:00.000Z"));
    expect(getNextPacificQuotaDayStart(afterSpringShift)).toEqual(new Date("2026-03-09T07:00:00.000Z"));
  });

  it("finds current and next midnight across the fall DST transition", () => {
    const beforeFallShift = new Date("2026-11-01T06:30:00.000Z"); // Oct 31, 23:30 PDT
    expect(getPacificQuotaDayStart(beforeFallShift)).toEqual(new Date("2026-10-31T07:00:00.000Z"));
    expect(getNextPacificQuotaDayStart(beforeFallShift)).toEqual(new Date("2026-11-01T07:00:00.000Z"));

    const afterFallShift = new Date("2026-11-01T10:00:00.000Z"); // Nov 1, 02:00 PST
    expect(getPacificQuotaDayStart(afterFallShift)).toEqual(new Date("2026-11-01T07:00:00.000Z"));
    expect(getNextPacificQuotaDayStart(afterFallShift)).toEqual(new Date("2026-11-02T08:00:00.000Z"));
  });
});
