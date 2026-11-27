import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPublicDailyExportQueryFlights, getOrLoadPublicDailyExportQuery } from "./public-daily-export-query-flight";

describe("public daily export query flights", () => {
  afterEach(() => {
    clearPublicDailyExportQueryFlights();
  });

  it("shares only an active query and removes it after success", async () => {
    let resolveLoad: ((value: { rows: number[] }) => void) | undefined;
    const load = vi.fn(() => new Promise<{ rows: number[] }>((resolve) => {
      resolveLoad = resolve;
    }));

    const owner = getOrLoadPublicDailyExportQuery("us:compact:batch-1", load);
    const follower = getOrLoadPublicDailyExportQuery("us:compact:batch-1", load);
    expect(owner.coalesced).toBe(false);
    expect(follower.coalesced).toBe(true);
    expect(load).toHaveBeenCalledTimes(0);

    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    resolveLoad?.({ rows: [1] });
    await expect(Promise.all([owner.promise, follower.promise])).resolves.toEqual([
      { rows: [1] },
      { rows: [1] },
    ]);

    const next = getOrLoadPublicDailyExportQuery("us:compact:batch-1", async () => ({ rows: [2] }));
    expect(next.coalesced).toBe(false);
    await expect(next.promise).resolves.toEqual({ rows: [2] });
  });

  it("does not share different query keys", async () => {
    const load = vi.fn(async (rows: number[]) => ({ rows }));
    const first = getOrLoadPublicDailyExportQuery("kr:compact:batch-1", () => load([1]));
    const second = getOrLoadPublicDailyExportQuery("kr:compact:batch-2", () => load([2]));

    expect(first.coalesced).toBe(false);
    expect(second.coalesced).toBe(false);
    await expect(Promise.all([first.promise, second.promise])).resolves.toEqual([
      { rows: [1] },
      { rows: [2] },
    ]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("removes a rejected query so a later caller can retry", async () => {
    const failed = getOrLoadPublicDailyExportQuery("us:full:batch-1", async () => {
      throw new Error("temporary query failure");
    });
    await expect(failed.promise).rejects.toThrow("temporary query failure");

    const retried = getOrLoadPublicDailyExportQuery("us:full:batch-1", async () => ({ rows: [3] }));
    expect(retried.coalesced).toBe(false);
    await expect(retried.promise).resolves.toEqual({ rows: [3] });
  });
});
