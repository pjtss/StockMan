import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPublicDailyExportResponseCache,
  getCachedPublicDailyExport,
  setCachedPublicDailyExport,
} from "@/lib/public-daily-export-response-cache";

describe("public daily export response cache", () => {
  afterEach(() => {
    clearPublicDailyExportResponseCache();
    vi.useRealTimers();
  });

  it("serves an isolated stale copy for 60 seconds after the five-minute fresh TTL", () => {
    vi.useFakeTimers();
    const original = new Uint8Array([1, 2, 3]);
    setCachedPublicDailyExport("US", "compact", original);
    original[0] = 9;

    const hit = getCachedPublicDailyExport("US", "compact");
    expect(hit).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "HIT" });
    hit!.bytes[0] = 8;
    expect(getCachedPublicDailyExport("US", "compact")).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "HIT" });

    vi.advanceTimersByTime(5 * 60_000 + 1);
    const stale = getCachedPublicDailyExport("US", "compact");
    expect(stale).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "STALE" });
    stale!.bytes[0] = 7;
    expect(getCachedPublicDailyExport("US", "compact")).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "STALE" });

    vi.advanceTimersByTime(60_000);
    expect(getCachedPublicDailyExport("US", "compact")).toBeNull();
  });

  it("does not retain an entry larger than the per-response memory cap", () => {
    setCachedPublicDailyExport("US", "full", new Uint8Array(16 * 1024 * 1024 + 1));
    expect(getCachedPublicDailyExport("US", "full")).toBeNull();
  });

  it("isolates cache reads when the completed exporter buffer transfers ownership", () => {
    const completed = new Uint8Array([4, 5, 6]);
    setCachedPublicDailyExport("US", "compact", completed, { takeOwnership: true });

    const firstRead = getCachedPublicDailyExport("US", "compact");
    expect(firstRead?.bytes).toEqual(new Uint8Array([4, 5, 6]));
    firstRead!.bytes[0] = 0;
    expect(getCachedPublicDailyExport("US", "compact")?.bytes).toEqual(new Uint8Array([4, 5, 6]));
  });

  it("only lends the cache-owned bytes when the caller opts into read-only streaming", () => {
    const completed = new Uint8Array([7, 8, 9]);
    setCachedPublicDailyExport("US", "compact", completed, { takeOwnership: true });

    const shared = getCachedPublicDailyExport("US", "compact", { copyBytes: false });
    const isolated = getCachedPublicDailyExport("US", "compact");

    expect(shared?.bytes).toBe(completed);
    expect(isolated?.bytes).not.toBe(completed);
    expect(isolated?.bytes).toEqual(completed);
  });
});
