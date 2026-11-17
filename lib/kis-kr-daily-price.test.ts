import { describe, expect, it } from "vitest";
import { parseKrDailyPriceRows } from "./kis-kr-daily-price";

const valid = {
  stck_bsop_date: "20261110",
  stck_oprc: "10",
  stck_hgpr: "12",
  stck_lwpr: "9",
  stck_clpr: "11",
  acml_vol: "100",
};

describe("KIS KR daily price row validation", () => {
  it("keeps valid rows and drops invalid dates, incomplete OHLCV and impossible ranges", () => {
    const invalid = [
      { ...valid, stck_bsop_date: "20260230" },
      { ...valid, stck_oprc: "" },
      { ...valid, stck_hgpr: "10.5" },
      { ...valid, stck_lwpr: "10.5" },
      { ...valid, acml_vol: "-1" },
    ];
    expect(parseKrDailyPriceRows([valid, ...invalid])).toEqual([
      { date: "20261110", open: 10, high: 12, low: 9, close: 11, volume: 100, raw: valid },
    ]);
  });
});
