import { describe, expect, it } from "vitest";
import { formatMarketRssPublishedAt } from "./market-rss-published-at";

describe("formatMarketRssPublishedAt", () => {
  it("formats UTC timestamps as KST, including the previous UTC date", () => {
    expect(formatMarketRssPublishedAt("2026-09-24T15:00:00.000Z")).toBe("2026-09-25 00:00 KST");
    expect(formatMarketRssPublishedAt("2026-09-25T06:00:00.000Z")).toBe("2026-09-25 15:00 KST");
  });

  it("handles missing and invalid publisher timestamps without throwing", () => {
    expect(formatMarketRssPublishedAt(null)).toBe("발행 시각 없음");
    expect(formatMarketRssPublishedAt("not-a-timestamp")).toBe("발행 시각 확인 필요");
  });
});
