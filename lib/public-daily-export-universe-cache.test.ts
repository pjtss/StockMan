import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPublicDailyExportUniverseCache, getOrLoadPublicDailyExportUniverse } from "./public-daily-export-universe-cache";

const rows = [{ market: "NAS", code: "AAPL", name: "Apple Inc." }];

describe("public daily export universe cache", () => {
  afterEach(() => {
    clearPublicDailyExportUniverseCache();
    vi.useRealTimers();
  });

  it("reuses only a successful non-empty market universe for five minutes", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => rows);

    expect(await getOrLoadPublicDailyExportUniverse("US", load)).toEqual({ rows, status: "MISS" });
    expect(await getOrLoadPublicDailyExportUniverse("US", load)).toEqual({ rows, status: "HIT" });
    expect(load).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await getOrLoadPublicDailyExportUniverse("US", load)).toEqual({ rows, status: "MISS" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not cache empty universes or failed master lookups", async () => {
    const empty = vi.fn(async () => []);
    expect(await getOrLoadPublicDailyExportUniverse("KR", empty)).toEqual({ rows: [], status: "MISS" });
    expect(await getOrLoadPublicDailyExportUniverse("KR", empty)).toEqual({ rows: [], status: "MISS" });
    expect(empty).toHaveBeenCalledTimes(2);

    const failing = vi.fn(async () => { throw new Error("master lookup failed"); });
    await expect(getOrLoadPublicDailyExportUniverse("KR", failing)).rejects.toThrow("master lookup failed");
    await expect(getOrLoadPublicDailyExportUniverse("KR", failing)).rejects.toThrow("master lookup failed");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("coalesces simultaneous cold lookups for a market", async () => {
    let finish!: (value: typeof rows) => void;
    const load = vi.fn(() => new Promise<typeof rows>((resolve) => { finish = resolve; }));
    const first = getOrLoadPublicDailyExportUniverse("US", load);
    const second = getOrLoadPublicDailyExportUniverse("US", load);
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    finish(rows);
    expect(await Promise.all([first, second])).toEqual([
      { rows, status: "MISS" },
      { rows, status: "COALESCED" },
    ]);
  });
});
