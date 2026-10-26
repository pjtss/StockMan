import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MarketNewsPage } from "./market-news-page";

afterEach(() => vi.unstubAllGlobals());

describe("MarketNewsPage", () => {
  it("renders only the linked title and supports original title view", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      items: [{
        title: { original: "Revenue rises", ko: "매출 증가" },
        link: "https://example.com/news",
      }],
      page: { pageSize: 50, returned: 1, nextCursor: null, hasMore: false },
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<MarketNewsPage />);

    const row = await screen.findByRole("article");
    expect(within(row).getByRole("link", { name: "매출 증가" })).toHaveAttribute("href", "https://example.com/news");
    expect(row.textContent).toBe("매출 증가");
    expect(screen.getByRole("button", { name: "1시간" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button").filter((button) => /^\d+시간$/.test(button.textContent ?? ""))).toHaveLength(24);

    fireEvent.click(screen.getByRole("button", { name: "원문 제목" }));
    expect(within(row).getByRole("link", { name: "Revenue rises" })).toBeInTheDocument();
    expect(row.textContent).toBe("Revenue rises");
  });
});
