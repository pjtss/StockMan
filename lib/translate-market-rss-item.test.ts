import { describe, expect, it, vi } from "vitest";
import { translateMarketRssItem, translateMarketRssItems } from "./translate-market-rss-item";
import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";

const item = (id: string, source = "STOCKTITAN"): MarketRssItem => ({ id, title: `Title ${id}`, summary: `Long summary ${id}`, content: `Full text ${id}`, link: "https://example.com", publishedAt: null, source });
const client = (translate: TranslationClient["translate"]): TranslationClient => ({ translate });

describe("market RSS translation", () => {
  it("translates the title only and preserves the original summary", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `번역:${text}`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const result = await translateMarketRssItem(item("1"), client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("Title 1");
    expect(result.translatedTitle).toBe("번역:Title 1");
    expect(result.translatedSummary).toBe("Long summary 1");
    expect(result.translatedContent).toBe("Full text 1");
  });

  it("never sends titles from other RSS sources to the translation provider", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `번역:${text}`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const result = await translateMarketRssItem(item("2", "NASDAQ"), client(translate));

    expect(translate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ translatedTitle: "Title 2", translationFallback: true, translationFallbackReason: "unsupported_source" });
  });

  it("sends only the StockTitan title, never the summary or body", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `번역:${text}`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    await translateMarketRssItem(item("3"), client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("Title 3");
    expect(translate).not.toHaveBeenCalledWith("Long summary 3");
    expect(translate).not.toHaveBeenCalledWith("Full text 3");
  });

  it("processes a batch with bounded concurrency and preserves input order", async () => {
    const order: string[] = [];
    const translate = vi.fn(async (text: string) => {
      order.push(`start:${text}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${text}`);
      return { translatedText: text, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });
    await translateMarketRssItems([item("1"), item("2"), item("3"), item("4"), item("5")], client(translate));

    expect(order.slice(0, 3)).toEqual(["start:Title 1", "start:Title 2", "start:Title 3"]);
    expect(order).toContain("start:Title 4");
    expect(order).toContain("start:Title 5");
    expect(translate).toHaveBeenCalledTimes(5);
  });
});
