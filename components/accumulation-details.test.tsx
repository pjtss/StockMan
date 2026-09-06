import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@/components/chart-modal", () => ({ ChartModal: () => null }));
import { TickerChartWorkbench } from "./ticker-chart-workbench";
import { AccumulationDetails } from "./accumulation-details";
import { evaluateAccumulationScan } from "@/lib/accumulation-scan";
import { accumulationInstrument, accumulationAsOf } from "@/lib/accumulation-test-fixtures";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("accumulation workbench integration", () => {
  it("uses the selected US market and preserves score order, with dates and reasons", async () => {
    const first = accumulationInstrument("AAA"), second = accumulationInstrument("BBB");
    first.marketCap = 1; second.marketCap = 100000000000;
    second.candles.slice(0, -1).forEach(c => c.volume = 100);
    const report = evaluateAccumulationScan("US", [first, second], { asOf: accumulationAsOf });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(report), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);
    render(<TickerChartWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "해외" }));
    fireEvent.click(screen.getByRole("button", { name: "매집 의심 종목 추출" }));
    await screen.findByRole("heading", { name: "매집 의심 종목 결과" });
    expect(fetcher).toHaveBeenCalledWith("/api/scan/us-accumulation?limit=100");
    expect(screen.getByPlaceholderText("예: AAPL, NVDA, MSFT")).toBeInTheDocument();
    expect(screen.getByDisplayValue("매집 점수 높은 순")).toBeInTheDocument();
    const cards = screen.getAllByRole("article");
    expect(cards[0]).toHaveTextContent("AAA"); expect(cards[1]).toHaveTextContent("BBB");
    expect(cards[0]).toHaveTextContent("75/100");
    expect(cards[0]).toHaveTextContent("20260828");
    expect(cards[0]).toHaveTextContent("KST");
    expect(screen.getByLabelText("매집 탐지 요약")).toHaveTextContent("통과 2개");
  });
  it("reveals every used candle timestamp together with its stock identity", async () => {
    const row = evaluateAccumulationScan("US", [accumulationInstrument()], { asOf: accumulationAsOf }).results[0];
    render(<AccumulationDetails row={row} />);
    const summary = screen.getByText("사용 일봉 65개 · 거래일/갱신시각");
    const details = summary.closest("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await waitFor(() => expect(screen.getByText(/테스트 AAA \(AAA\) · 20260601/)).toBeInTheDocument());
    expect(screen.getAllByText(/거래시각 원본 미제공/)).toHaveLength(65);
  });
  it("shows sanitized scan failures without claiming completion", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: "US_ACCUMULATION_UNAVAILABLE" }), { status: 503 })));
    render(<TickerChartWorkbench />);
    fireEvent.click(screen.getByRole("button", { name: "매집 의심 종목 추출" }));
    await screen.findByText("US_ACCUMULATION_UNAVAILABLE");
    expect(screen.queryByRole("heading", { name: "매집 의심 종목 결과" })).not.toBeInTheDocument();
  });
});
