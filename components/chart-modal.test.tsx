import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChartModal } from "./chart-modal";

const chartMocks = vi.hoisted(() => ({
  createChart: vi.fn(),
  series: [] as Array<{ kind: string; setData: ReturnType<typeof vi.fn> }>,
}));

vi.mock("@/lib/chart-library", () => ({
  loadChartLibrary: async () => ({
    createChart: chartMocks.createChart,
    CrosshairMode: { Normal: 0 },
    CandlestickSeries: "candles",
    LineSeries: "line",
    HistogramSeries: "histogram",
    LineStyle: { Dotted: 1 },
  }),
}));

function jsonResponse(body: unknown) {
  const text = JSON.stringify(body);
  return { ok: true, status: 200, json: async () => body, text: async () => text };
}

describe("ChartModal", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    chartMocks.series = [];
    chartMocks.createChart.mockReset();

    chartMocks.createChart.mockReturnValue({
      addSeries: (kind: string) => {
        const series = { kind, setData: vi.fn() };
        chartMocks.series.push(series);
        return series;
      },
      priceScale: () => ({ applyOptions: vi.fn() }),
      timeScale: () => ({ fitContent: vi.fn() }),
      applyOptions: vi.fn(),
      remove: vi.fn(),
    });

    vi.stubGlobal("ResizeObserver", class {
      observe = vi.fn();
      disconnect = vi.fn();
      unobserve = vi.fn();
    });

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/stock/chart?")) {
        return jsonResponse({
          code: "005930",
          company: "삼성전자",
          candles: [
            { date: "20261016", open: 100, high: 110, low: 95, close: 105, volume: 1200 },
            { date: "20261015", open: 90, high: 105, low: 85, close: 100, volume: 900 },
            { date: "20261014", open: -1, high: 110, low: -2, close: 100, volume: 800 },
          ],
          indicators: { rsi14: 50, macd: 1, macdSignal: 0, macdHist: 1, bbUpper: 120, bbMiddle: 100, bbLower: 80 },
          latestPrice: 105,
          latestChange: "+5",
          latestChangeRate: "+5.0%",
          candleDataUpdatedAt: "2026-10-16T06:00:00Z",
        });
      }
      if (url.startsWith("/api/auth/me")) return jsonResponse({ authenticated: false });
      throw new Error(`Unexpected request in chart modal test: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads chart data, draws normalized candles, and exposes chart controls", async () => {
    render(<ChartModal code="005930" company="삼성전자" onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("삼성전자")).toBeInTheDocument();
    expect(screen.getByText(/EMA 9/)).toBeInTheDocument();
    expect(screen.getByText(/EMA 20/)).toBeInTheDocument();
    expect(screen.getByText(/EMA 60/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "닫기" })).toBeInTheDocument();

    await waitFor(() => expect(chartMocks.createChart).toHaveBeenCalledTimes(1));
    const candleSeries = chartMocks.series.find((series) => series.kind === "candles");
    expect(candleSeries).toBeDefined();
    expect(candleSeries!.setData).toHaveBeenCalledWith([
      { time: "2026-10-15", open: 90, high: 105, low: 85, close: 100 },
      { time: "2026-10-16", open: 100, high: 110, low: 95, close: 105 },
    ]);
  });

  it("closes from the visible close control and Escape key", async () => {
    const onClose = vi.fn();
    render(<ChartModal code="005930" company="삼성전자" onClose={onClose} />);

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it.each([
    { storedValue: "null", code: "000660" },
    { storedValue: "[]", code: "000661" },
    { storedValue: "false", code: "000662" },
    { storedValue: "{", code: "000663" },
  ])("recovers to the default timeframe when persisted settings are invalid: $storedValue", async ({ storedValue, code }) => {
    window.sessionStorage.setItem("stockman:chart-modal-settings", storedValue);

    render(<ChartModal code={code} company="테스트 종목" onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "일봉" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.includes("/api/stock/chart?") && url.includes("timeframe=D"))).toBe(true);
    });
  });
});
