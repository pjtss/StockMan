import { describe, expect, it, vi } from "vitest";
import { translateMarketRssItem, translateMarketRssItems } from "./translate-market-rss-item";
import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";

const item = (id: string): MarketRssItem => ({ id, title: `Title ${id}`, summary: `Long summary ${id}`, link: "https://example.com", publishedAt: null, source: "TEST" });
const client = (translate: TranslationClient["translate"]): TranslationClient => ({ translate });

describe("market RSS translation", () => {
  it("translates both title and summary for debugging visibility", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `번역:${text}`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const result = await translateMarketRssItem(item("1"), client(translate));

    expect(translate).toHaveBeenCalledTimes(2);
    expect(translate).toHaveBeenCalledWith("Title 1");
    expect(translate).toHaveBeenCalledWith("Long summary 1");
    expect(result.translatedTitle).toBe("번역:Title 1");
    expect(result.translatedSummary).toBe("번역:Long summary 1");
  });

  it("processes a batch sequentially", async () => {
    const order: string[] = [];
    const translate = vi.fn(async (text: string) => {
      order.push(`start:${text}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${text}`);
      return { translatedText: text, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });
    await translateMarketRssItems([item("1"), item("2")], client(translate));

    expect(order).toEqual(["start:Title 1", "end:Title 1", "start:Long summary 1", "end:Long summary 1", "start:Title 2", "end:Title 2", "start:Long summary 2", "end:Long summary 2"]);
  });
});
