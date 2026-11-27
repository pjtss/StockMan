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

  it("serves an isolated stale copy for 60 seconds after the fresh TTL", () => {
    vi.useFakeTimers();
    const original = new Uint8Array([1, 2, 3]);
    setCachedPublicDailyExport("US", "compact", original);
    original[0] = 9;

    const hit = getCachedPublicDailyExport("US", "compact");
    expect(hit).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "HIT" });
    hit!.bytes[0] = 8;
    expect(getCachedPublicDailyExport("US", "compact")).toEqual({ bytes: new Uint8Array([1, 2, 3]), state: "HIT" });

    vi.advanceTimersByTime(60_001);
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
});
