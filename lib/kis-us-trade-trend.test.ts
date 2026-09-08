import { describe, expect, it } from "vitest";
import { parseKisUsAskingRows } from "./kis-us-trade-trend";

describe("KIS US asking-price response", () => {
  it("normalizes object and array output blocks", () => {
    expect(parseKisUsAskingRows({ output1: { symb: "AAPL" }, output2: [{ pbid1: "100" }], output3: null })).toEqual([{ symb: "AAPL" }, { pbid1: "100" }]);
  });

  it("returns an empty list for missing output blocks", () => {
    expect(parseKisUsAskingRows(null)).toEqual([]);
  });
});
