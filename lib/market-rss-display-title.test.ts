import { describe, expect, it } from "vitest";
import { getMarketRssDisplayTitle } from "./market-rss-display-title";

describe("getMarketRssDisplayTitle", () => {
  it("never exposes a partial translation when the stored outcome says fallback", () => {
    expect(getMarketRssDisplayTitle({
      title: "Nvidia revenue rises sharply",
      translatedTitle: "Nvidia revenue rises sharply 상승",
      translationFallback: true,
    })).toBe("Nvidia revenue rises sharply");
  });

  it("uses a completed translation or falls back to the source when no translation exists", () => {
    expect(getMarketRssDisplayTitle({ title: "Revenue rises", translatedTitle: "매출 증가", translationFallback: false }))
      .toBe("매출 증가");
    expect(getMarketRssDisplayTitle({ title: "Revenue rises", translatedTitle: null, translationFallback: false }))
      .toBe("Revenue rises");
  });
});
