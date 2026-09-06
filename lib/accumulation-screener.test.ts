import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./accumulation-repository", () => ({ loadAccumulationInstruments: vi.fn() }));
import { loadAccumulationInstruments } from "./accumulation-repository";
import { runAccumulationScreener } from "./accumulation-screener";
import { runKrAccumulationScreener } from "./kr-accumulation-screener";
import { runUsAccumulationScreener } from "./us-accumulation-screener";
import { accumulationInstrument, accumulationAsOf } from "./accumulation-test-fixtures";
const load = vi.mocked(loadAccumulationInstruments);
beforeEach(() => { load.mockReset(); });
describe("accumulation shared orchestration", () => {
  it("passes one clock and normalized options through the complete pipeline", async () => {
    load.mockResolvedValue([accumulationInstrument()]);
    const report = await runAccumulationScreener("US", { asOf: accumulationAsOf, limit: NaN });
    expect(load).toHaveBeenCalledWith("US", accumulationAsOf);
    expect(report.count).toBe(1); expect(report.timings.totalMs).toBeGreaterThanOrEqual(0);
    expect(report.checkedAt).toBe(accumulationAsOf.toISOString());
  });
  it.each([["KR", runKrAccumulationScreener], ["US", runUsAccumulationScreener]] as const)("keeps the %s array wrapper on the shared pipeline", async (region, wrapper) => {
    load.mockResolvedValue([accumulationInstrument("AAA", region === "KR" ? "KOSPI" : "NAS")]);
    const rows = await wrapper(10, 2);
    expect(rows).toHaveLength(1); expect(rows[0].logicVersion).toBe("2.0.0");
    expect(load.mock.calls[0][0]).toBe(region);
  });
  it("coalesces concurrent scans with the same effective options", async () => {
    load.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return []; });
    const [first, second] = await Promise.all([runAccumulationScreener("US", { asOf: accumulationAsOf }), runAccumulationScreener("US", { asOf: accumulationAsOf })]);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledOnce();
  });
});
