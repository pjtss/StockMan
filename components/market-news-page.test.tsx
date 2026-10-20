import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketNewsPage } from "./market-news-page";

afterEach(() => vi.unstubAllGlobals());

describe("MarketNewsPage", () => {
  it("shows source summary when API payload contains a stale translated summary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [{
      id: 1,
      source: "NASDAQ",
      title: "Revenue rises",
      translatedTitle: "매출 증가",
      summary: "Source-language summary",
      translatedSummary: "Stale supposed translation",
      link: "https://example.com/news",
      publishedAt: "2026-09-25T01:00:00.000Z",
      detectedTicker: "TEST",
    }] }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<MarketNewsPage />);

    expect(await screen.findByText("원문 요약 · 미번역")).toBeInTheDocument();
    expect(screen.getByText("Source-language summary")).toBeInTheDocument();
    expect(screen.queryByText("Stale supposed translation")).not.toBeInTheDocument();
  });
});
