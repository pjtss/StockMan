import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MarketNewsPage } from "./market-news-page";

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.useRealTimers();
});

describe("MarketNewsPage", () => {
  it("shows source summary when API payload contains a stale translated summary", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, items: [{
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

  it("refreshes the feed every 10 seconds while visible", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, items: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MarketNewsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("/api/market-news?");
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ cache: "no-store" });
  });

  it("does not issue overlapping refresh requests", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveRequest = resolve; }));
    vi.stubGlobal("fetch", fetchMock);

    render(<MarketNewsPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest?.(new Response(JSON.stringify({ ok: true, items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
      await Promise.resolve();
    });
  });
});
