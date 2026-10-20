import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));

import { discordDeliveryQueue, marketRssArticles } from "@/lib/schema";
import { markDiscordDeliverySuperseded } from "./discord-delivery-queue";

describe("markDiscordDeliverySuperseded", () => {
  beforeEach(() => mocks.getDb.mockReset());

  it("atomically retires the stale queue row and reopens only a failed RSS article without incrementing attempts", async () => {
    const updates: Array<{ table: unknown; values: Record<string, unknown>; condition: unknown }> = [];
    const tx = {
      update(table: unknown) {
        return {
          set(values: Record<string, unknown>) {
            return {
              where(condition: unknown) {
                updates.push({ table, values, condition });
                const result = updates.length === 1 ? [{ id: 7 }] : [];
                return Object.assign(Promise.resolve(result), { returning: async () => result });
              },
            };
          },
        };
      },
    };
    mocks.getDb.mockReturnValue({ transaction: (callback: (transaction: typeof tx) => Promise<void>) => callback(tx) });
    const claimedAt = new Date("2026-09-26T03:00:00.123Z");

    await markDiscordDeliverySuperseded({ id: 7, articleId: 19, claimedAt });

    expect(updates).toHaveLength(2);
    expect(updates[0].table).toBe(discordDeliveryQueue);
    expect(updates[0].values).toMatchObject({ status: "FAILED", lastError: "market_rss_payload_superseded" });
    expect(new PgDialect().sqlToQuery(updates[0].condition as never).params).toEqual([7, "PROCESSING", claimedAt.toISOString()]);
    expect(updates[1].table).toBe(marketRssArticles);
    expect(updates[1].values).toMatchObject({ notificationStatus: "PENDING", lastError: null });
    expect(updates[1].values).not.toHaveProperty("notificationAttempts");
    expect(new PgDialect().sqlToQuery(updates[1].condition as never).params).toEqual([19, "FAILED"]);
  });

  it("does not reopen the article when the queue lease was already lost", async () => {
    let updateCount = 0;
    const tx = {
      update() {
        return {
          set() {
            return {
              where() {
                updateCount++;
                return Object.assign(Promise.resolve([]), { returning: async () => [] });
              },
            };
          },
        };
      },
    };
    mocks.getDb.mockReturnValue({ transaction: (callback: (transaction: typeof tx) => Promise<void>) => callback(tx) });

    await expect(markDiscordDeliverySuperseded({ id: 7, articleId: 19, claimedAt: new Date() }))
      .rejects.toThrow("discord_delivery_claim_lost_before_supersede");
    expect(updateCount).toBe(1);
  });
});
