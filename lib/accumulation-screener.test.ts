import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./accumulation-repository", () => ({ loadAccumulationInstruments: vi.fn() }));
import { loadAccumulationInstruments } from "./accumulation-repository";
import { runAccumulationScreener } from "./accumulation-screener";
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
  it("coalesces concurrent scans with the same effective options", async () => {
    load.mockImplementation(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); return []; });
    const [first, second] = await Promise.all([runAccumulationScreener("US", { asOf: accumulationAsOf }), runAccumulationScreener("US", { asOf: accumulationAsOf })]);
    expect(first).toBe(second);
    expect(load).toHaveBeenCalledOnce();
  });
});
