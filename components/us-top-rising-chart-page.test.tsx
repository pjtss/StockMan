import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UsTopRisingChartPage } from "./us-top-rising-chart-page";

vi.mock("@/components/chart-modal", () => ({
  ChartModal: (props: { code: string; onClose: () => void }) => <div data-testid="chart-modal" data-code={props.code}><button onClick={props.onClose}>모달 닫기</button></div>,
}));

afterEach(() => vi.unstubAllGlobals());

function mockResponse(items: unknown[], markets = [{ market: "NAS", status: 200, responseOk: true, sourceCount: 2, requestedCount: 100, sourceComplete: false, selectedCount: 2, eligibleCommonStockCount: 2, productExcluded: 0, fallbackUsed: false, collectedAt: "2026-10-07T01:00:00.000Z", error: "PARTIAL_RANKING_PAGE" }]) {
  return new Response(JSON.stringify({ ok: true, complete: false, collectedAt: new Date(Date.now() - 12_000).toISOString(), ageSeconds: 12, items, markets, availableMarketCount: 1, completeMarketCount: 0 }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("UsTopRisingChartPage", () => {
  it("surfaces partial exchange coverage and the actual source age", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse([{ market: "NAS", code: "AAA", name: "A Corp", rank: 1, changeRate: 5 }])));

    render(<UsTopRisingChartPage />);

    expect(await screen.findByText("부분 수신 2/100")).toBeInTheDocument();
    expect(screen.getByText(/KST · \d+초 전/)).toBeInTheDocument();
    expect(screen.getByText("거래소별 KIS 원천 순위")).toBeInTheDocument();
  });

  it("warns when the source timestamp is missing instead of implying freshness", async () => {
    const body = { ok: true, complete: false, collectedAt: null, ageSeconds: null, items: [{ market: "NAS", code: "AAA", name: "A Corp", rank: 1, changeRate: 5 }], markets: [], availableMarketCount: 0, completeMarketCount: 0 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } })));

    render(<UsTopRisingChartPage />);

    expect(await screen.findByText(/원천 수집 시각을 확인할 수 없습니다/)).toBeInTheDocument();
  });

  it("does not silently truncate focus candidates at twenty rows", async () => {
    const items = Array.from({ length: 25 }, (_, index) => ({ market: "NAS", code: `T${index + 1}`, name: `Ticker ${index + 1}`, rank: index + 1, focusRank: index + 1, changeRate: 25 - index, priority: 100 - index, turnoverToMarketCap: 0.02, focusTracking: true }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(items, [])));

    render(<UsTopRisingChartPage />);

    expect(await screen.findAllByText("Ticker 25")).toHaveLength(2);
    const focusSection = screen.getAllByText("집중 탐지 후보")[1].closest("section");
    expect(focusSection?.querySelectorAll("article")).toHaveLength(25);
    expect(screen.getAllByRole("button", { name: /차트 보기/ })).toHaveLength(50);
    expect(screen.getByText("Q25")).toBeInTheDocument();
  });

  it("keeps the selected ticker in the chart modal when refreshed ranking order changes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockResponse([
        { market: "NAS", code: "AAA", name: "Alpha", rank: 1, changeRate: 9 },
        { market: "NAS", code: "BBB", name: "Beta", rank: 2, changeRate: 8 },
      ]))
      .mockResolvedValueOnce(mockResponse([
        { market: "NAS", code: "BBB", name: "Beta", rank: 1, changeRate: 12 },
        { market: "NAS", code: "AAA", name: "Alpha", rank: 2, changeRate: 10 },
      ]));
    vi.stubGlobal("fetch", fetchMock);

    render(<UsTopRisingChartPage />);
    fireEvent.click(await screen.findAllByRole("button", { name: /차트 보기/ }).then((buttons) => buttons[0]));
    expect(screen.getByTestId("chart-modal")).toHaveAttribute("data-code", "US:AAA");

    fireEvent.click(screen.getByRole("button", { name: "↻ 서버 목록 다시 조회" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("chart-modal")).toHaveAttribute("data-code", "US:AAA"));
  });

  it("explains when the market-cap turnover ratio is unavailable instead of presenting a blank metric", async () => {
    const items = [{ market: "NAS", code: "AAA", name: "Alpha", rank: 1, focusRank: 1, changeRate: 5, priority: 10, focusTracking: true, turnoverToMarketCap: null }];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse(items, [])));
    render(<UsTopRisingChartPage />);

    expect(await screen.findByText(/시총 또는 순위 거래대금 미확인/)).toBeInTheDocument();
    expect(screen.getByText("미확인")).toBeInTheDocument();
  });
});
