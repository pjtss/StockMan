import { describe, expect, it } from "vitest";
import { evaluateScreenerFilters, rankScreenerResults } from "./screener-engine";
describe("screener engine", () => {
  it("evaluates AND conditions", () => { const r=evaluateScreenerFilters({marketCap:100, "D.rvol":1.2},{filters:[{field:"marketCap",operator:">=",value:100},{field:"D.rvol",operator:">=",value:1}],logic:"AND"}); expect(r.matched).toBe(true); });
  it("keeps failed reasons", () => { const r=evaluateScreenerFilters({marketCap:90},{filters:[{field:"marketCap",operator:">=",value:100}]}); expect(r.failureReasons).toHaveLength(1); });
  it("ranks descending", () => { const rows:any=[{name:"a",metrics:{score:1}},{name:"b",metrics:{score:2}}]; expect(rankScreenerResults(rows,{ranking:[{field:"score",direction:"DESC"}]}).map(x=>x.name)).toEqual(["b","a"]); });
  it("supports pure fundamental/volume filters without a Bollinger condition", () => {
    const r = evaluateScreenerFilters({ marketCap: 50_000_000_000, "D.rvol": 2.1 }, { filters: [{ field: "marketCap", operator: ">=", value: 30_000_000_000 }, { field: "D.rvol", operator: ">=", value: 2 }] });
    expect(r.matched).toBe(true);
  });
  it("filters OBV and ADL signal trends independently", () => {
    const r = evaluateScreenerFilters({ "D.obv.signalTrend": "RISING", "D.adl.signalTrend": "FALLING" }, { filters: [{ field: "D.obv.signalTrend", operator: "=", value: "RISING" }, { field: "D.adl.signalTrend", operator: "=", value: "FALLING" }] });
    expect(r.matched).toBe(true);
  });
});
