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

  it("expires completed gzip bytes after 60 seconds and returns an isolated copy", () => {
    vi.useFakeTimers();
    const original = new Uint8Array([1, 2, 3]);
    setCachedPublicDailyExport("US", "compact", original);
    original[0] = 9;

    const hit = getCachedPublicDailyExport("US", "compact");
    expect(hit).toEqual(new Uint8Array([1, 2, 3]));
    hit![0] = 8;
    expect(getCachedPublicDailyExport("US", "compact")).toEqual(new Uint8Array([1, 2, 3]));

    vi.advanceTimersByTime(60_001);
    expect(getCachedPublicDailyExport("US", "compact")).toBeNull();
  });

  it("does not retain an entry larger than the per-response memory cap", () => {
    setCachedPublicDailyExport("US", "full", new Uint8Array(16 * 1024 * 1024 + 1));
    expect(getCachedPublicDailyExport("US", "full")).toBeNull();
  });
});
