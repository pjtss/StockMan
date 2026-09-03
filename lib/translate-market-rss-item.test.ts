import { describe, expect, it, vi } from "vitest";
import { translateMarketRssItem, translateMarketRssItems } from "./translate-market-rss-item";
import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";

const item = (id: string): MarketRssItem => ({ id, title: `Title ${id}`, summary: `Long summary ${id}`, link: "https://example.com", publishedAt: null, source: "TEST" });
const client = (translate: TranslationClient["translate"]): TranslationClient => ({ translate });

describe("market RSS translation", () => {
  it("translates the title only and preserves the original summary", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `번역:${text}`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const result = await translateMarketRssItem(item("1"), client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("Title 1");
    expect(result.translatedTitle).toBe("번역:Title 1");
    expect(result.translatedSummary).toBe("Long summary 1");
  });

  it("processes a batch sequentially", async () => {
    const order: string[] = [];
    const translate = vi.fn(async (text: string) => {
      order.push(`start:${text}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${text}`);
      return { translatedText: text, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });
    await translateMarketRssItems([item("1"), item("2"), item("3"), item("4"), item("5")], client(translate));

    expect(order).toEqual(["start:Title 1", "end:Title 1", "start:Title 2", "end:Title 2", "start:Title 3", "end:Title 3", "start:Title 4", "end:Title 4", "start:Title 5", "end:Title 5"]);
    expect(translate).toHaveBeenCalledTimes(5);
  });
});
