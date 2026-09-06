import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./accumulation-screener", () => ({ runAccumulationScreener: vi.fn() }));
import { runAccumulationScreener } from "./accumulation-screener";
import { GET as kr } from "../app/api/scan/kr-accumulation/route";
import { GET as us } from "../app/api/scan/us-accumulation/route";
import { evaluateAccumulationScan } from "./accumulation-scan";
import { accumulationInstrument, accumulationAsOf } from "./accumulation-test-fixtures";
const run = vi.mocked(runAccumulationScreener);
beforeEach(() => { run.mockReset(); });
describe("both accumulation APIs", () => {
  it.each([["KR", kr], ["US", us]] as const)("returns v2 evidence, full counts and all used-bar metadata for %s", async (region, handler) => {
    const report = evaluateAccumulationScan(region, [accumulationInstrument()], { asOf: accumulationAsOf });
    run.mockResolvedValue(report);
    const response = await handler(new Request("http://localhost/?limit=500&minRvol=3&minScore=70"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual(JSON.parse(JSON.stringify(report)));
    expect(body.results[0].timeframeMeta.daily.usedCandles).toHaveLength(65);
    expect(run).toHaveBeenCalledWith(region, { limit: 500, minRvol: 3, minScore: 70 });
  });
  it.each(["limit=NaN", "limit=1.5", "limit=0", "minRvol=-2", "minRvol=Infinity", "minScore=101", "minScore="])("rejects bad input %s without hitting DB", async query => {
    expect((await us(new Request("http://localhost/?" + query))).status).toBe(400);
    expect(run).not.toHaveBeenCalled();
  });
  it("caps return limits and returns a sanitized 503 on failure", async () => {
    run.mockRejectedValue(new Error("private database credential"));
    const response = await us(new Request("http://localhost/?limit=99999"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "US_ACCUMULATION_UNAVAILABLE" });
    expect(run).toHaveBeenCalledWith("US", { limit: 1000 });
  });
});
