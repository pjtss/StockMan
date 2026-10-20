import { describe, expect, it, vi } from "vitest";
import { queueCurrentFeedBackfill } from "./current-feed-backfill.mjs";

describe("current-feed initial backfill module", () => {
  it("fetches sources concurrently and queues each result with one observed timestamp", async () => {
    const resolvers: Array<(value: { items: Array<Record<string, unknown>> }) => void> = [];
    const fetchFeed = vi.fn(() => new Promise<{ items: Array<Record<string, unknown>> }>((resolve) => {
      resolvers.push(resolve);
      if (resolvers.length === 2) {
        resolvers[0]({ items: [{ title: "StockTitan article" }] });
        resolvers[1]({ items: [{ title: "SEC filing" }] });
      }
    }));
    const queueInitialBackfill = vi.fn((source: string, items: Array<Record<string, unknown>>, observedAt: string) => ({ source, feedItems: items.length, acceptedItems: items.length, newItems: items.length, backfill: true as const, observedAt }));
    const store = { csvPath: "downloads.csv", statePath: "state.json", queueInitialBackfill };
    const feeds = [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }, { source: "SEC_EDGAR", url: "https://www.sec.gov/feed" }];
    const now = vi.fn(() => new Date("2026-09-27T08:00:00.000Z"));

    const result = await queueCurrentFeedBackfill({ feeds, fetchFeed, store, now });
    expect(fetchFeed).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, backfill: true, newCount: 2, failedSources: [] });
    expect(queueInitialBackfill).toHaveBeenCalledWith("STOCKTITAN", [{ title: "StockTitan article" }], "2026-09-27T08:00:00.000Z");
    expect(queueInitialBackfill).toHaveBeenCalledWith("SEC_EDGAR", [{ title: "SEC filing" }], "2026-09-27T08:00:00.000Z");
  });

  it("isolates a failed source and still queues a successful source", async () => {
    const queueInitialBackfill = vi.fn(() => ({ newItems: 1 }));
    const feeds = [{ source: "STOCKTITAN", url: "https://www.stocktitan.net/rss" }, { source: "SEC_EDGAR", url: "https://www.sec.gov/feed" }];
    const result = await queueCurrentFeedBackfill({
      feeds,
      fetchFeed: async (feed) => {
        if (feed.source === "STOCKTITAN") throw new Error("HTTP 429");
        return { items: [{ title: "filing" }] };
      },
      store: { csvPath: "downloads.csv", statePath: "state.json", queueInitialBackfill },
    });
    expect(result).toMatchObject({ ok: true, newCount: 1, failedSources: ["STOCKTITAN"], errors: [{ source: "STOCKTITAN", message: "HTTP 429" }] });
    expect(queueInitialBackfill).toHaveBeenCalledTimes(1);
  });
});
