import { describe, expect, it } from "vitest";
import { isDailyCacheSyncSuccessful, isDailyCacheWriteVerified } from "./daily-cache-sync-result.mjs";

describe("isDailyCacheWriteVerified", () => {
  it("accepts a complete non-empty database verification", () => {
    expect(isDailyCacheWriteVerified(1200, 1200)).toBe(true);
  });

  it.each([[0, 0], [1200, 0], [1200, 1199], [-1, -1], [1.5, 1.5]])(
    "rejects incomplete or invalid counts (%s, %s)",
    (expected, verified) => {
      expect(isDailyCacheWriteVerified(expected, verified)).toBe(false);
    },
  );
});

describe("isDailyCacheSyncSuccessful", () => {
  it("accepts complete fetched and saved batches", () => {
    expect(isDailyCacheSyncSuccessful({ KR: { universe: 2, fetched: 4, saved: 4, failed: 0 } }, 0)).toBe(true);
  });

  it.each([
    [{ KR: { universe: 2, fetched: 4, saved: 3, failed: 0 } }, 0],
    [{ KR: { universe: 2, fetched: 0, saved: 0, failed: 0 } }, 0],
    [{ KR: { universe: 2, fetched: 4, saved: 4, failed: 1 } }, 0],
    [{ KR: { universe: 2, fetched: 4, saved: 4, failed: 0 } }, 1],
    [{ KR: { universe: 0, fetched: 4, saved: 4, failed: 0 } }, 0],
    [{}, 0],
  ])("rejects partial, empty, or failed runs", (markets, fallbackFailed) => {
    expect(isDailyCacheSyncSuccessful(markets, fallbackFailed)).toBe(false);
  });
});
