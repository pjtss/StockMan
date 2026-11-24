import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chartDataMemoryKey, clearChartDataMemory, setChartDataMemory } from "@/lib/chart-data-memory-cache";
import { ChartModal, chartTime, fetchChartData, minuteRowsToChartData } from "./chart-modal";

const chartMocks = vi.hoisted(() => ({
  createChart: vi.fn(),
  series: [] as Array<{ kind: string; setData: ReturnType<typeof vi.fn> }>,
  minuteRows: [] as Array<Record<string, unknown>>,
  authenticated: false,
}));
const realtimeMocks = vi.hoisted(() => ({ decrypt: vi.fn() }));

vi.mock("@/lib/kis-realtime-payload", () => ({ decryptKisRealtimePayload: realtimeMocks.decrypt }));

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
    clearChartDataMemory();
    window.sessionStorage.clear();
    chartMocks.series = [];
    chartMocks.minuteRows = [];
    chartMocks.authenticated = false;
    chartMocks.createChart.mockReset();
    realtimeMocks.decrypt.mockReset();

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
      if (url.startsWith("/api/kis/market-flow?")) return jsonResponse({ ok: true, rows: chartMocks.minuteRows });
      if (url.startsWith("/api/stock/lookup?")) return jsonResponse({ names: { "KOSDAQ:005930": "거래소 지정 삼성전자", "005930": "기본 삼성전자" } });
      if (url.startsWith("/api/kis/realtime/approval?")) return jsonResponse({ ok: true, wsUrl: "wss://example.test", frame: "subscribe" });
      if (url === "/api/kis/realtime/events") return jsonResponse({ ok: true });
      if (url.startsWith("/api/watchlist?")) return jsonResponse({ items: [] });
      if (url === "/api/watchlist") return jsonResponse({ ok: true });
      if (url.startsWith("/api/auth/me")) return jsonResponse({ authenticated: chartMocks.authenticated });
      throw new Error(`Unexpected request in chart modal test: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("keeps only minute candles with valid date, time, numeric OHLCV, and price bounds", () => {
    const valid = { stck_bsop_date: "20261112", stck_cntg_hour: "0930", stck_oprc: "100", stck_hgpr: "105", stck_lwpr: "98", stck_prpr: "102", cntg_vol: "50" };
    const chart = minuteRowsToChartData("005930", "삼성전자", [
      valid,
      { ...valid, stck_bsop_date: "20261131" },
      { ...valid, stck_cntg_hour: "296000" },
      { ...valid, cntg_vol: "" },
      { ...valid, stck_oprc: true },
      { ...valid, stck_hgpr: "99" },
    ]);

    expect(chart.candles).toEqual([{ date: "20261112093000", open: 100, high: 105, low: 98, close: 102, volume: 50, tradingValue: null, raw: valid }]);
  });

  it("pairs overseas KIS timestamps from the same Korea-time fields", () => {
    const row = { xymd: "20261111", xhms: "203000", kymd: "20261112", khms: "103000", open: "100", high: "105", low: "98", last: "102", evol: "50" };
    const chart = minuteRowsToChartData("US:AAPL", "Apple Inc.", [row, { ...row, kymd: undefined, xhms: undefined }]);

    expect(chart.candles[0].date).toBe("20261112103000");
    expect(chart.candles).toHaveLength(1);
  });

  it("encodes intraday wall-clock timestamps in UTC for timezone-stable chart labels", () => {
    expect(chartTime("20261112093000")).toBe(Date.UTC(2026, 10, 12, 9, 30, 0) / 1000);
  });

  it("uses current code and company metadata on a normalized cache hit", async () => {
    const key = chartDataMemoryKey("US:AAPL", "5", "NAS");
    setChartDataMemory(key, minuteRowsToChartData("US:AAPL", "Old Name", [{ xymd: "20261111", xhms: "203000", kymd: "20261112", khms: "103000", open: "100", high: "105", low: "98", last: "102", evol: "50" }]));

    const result = await fetchChartData("us:aapl", "Current Name", "5", undefined, "nas");

    expect(result).toMatchObject({ code: "us:aapl", company: "Current Name" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends normalized lowercase US-prefixed tickers to the US chart API", async () => {
    await fetchChartData(" us:aapl ", "Apple Inc.", "D", undefined, "NAS");

    const requestUrl = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(requestUrl).toContain("market=US");
    expect(requestUrl).toContain("exchange=NAS");
  });

  it("uses case-insensitive US ticker classification for modal flow requests", async () => {
    render(<ChartModal code="us:AAPL" company="Apple Inc." exchange="NAS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));

    await waitFor(() => {
      const flowUrls = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/kis/market-flow?"));
      expect(flowUrls.some((url) => url.includes("market=US"))).toBe(true);
      expect(flowUrls.some((url) => url.includes("market=KR"))).toBe(false);
    });
  });

  it("trims and removes the US prefix before ticker name lookup", async () => {
    render(<ChartModal code=" us:aapl " company="AAPL" onClose={vi.fn()} />);

    await waitFor(() => {
      const lookupUrl = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).find((url) => url.startsWith("/api/stock/lookup?"));
      expect(lookupUrl).toContain("market=US");
      expect(lookupUrl).toContain("codes=AAPL");
    });
  });

  it("saves a normalized US ticker to the watchlist", async () => {
    chartMocks.authenticated = true;
    render(<ChartModal code=" us:aapl " company="Apple Inc." onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "☆ 관심종목 추가" }));
    await waitFor(() => {
      const saveCall = vi.mocked(fetch).mock.calls.find(([input, init]) => String(input) === "/api/watchlist" && init?.method === "POST");
      expect(saveCall).toBeDefined();
      expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({ market: "US", code: "AAPL" });
    });
  });

  it("does not apply a watchlist response to a different ticker after navigation", async () => {
    chartMocks.authenticated = true;
    let resolvePost!: (response: ReturnType<typeof jsonResponse>) => void;
    const delayedPost = new Promise<ReturnType<typeof jsonResponse>>((resolve) => { resolvePost = resolve; });
    const fetchMock = vi.mocked(fetch);
    const defaultImplementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => String(input) === "/api/watchlist" && init?.method === "POST"
      ? delayedPost
      : defaultImplementation!(input, init));

    const onClose = vi.fn();
    const view = render(<ChartModal code="US:AAPL" company="Apple Inc." onClose={onClose} />);
    fireEvent.click(await screen.findByRole("button", { name: "☆ 관심종목 추가" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => String(input) === "/api/watchlist" && init?.method === "POST")).toBe(true));

    view.rerender(<ChartModal code="US:MSFT" company="Microsoft" onClose={onClose} />);
    await screen.findByText("Microsoft");
    resolvePost(jsonResponse({ ok: true }));

    expect(await screen.findByRole("button", { name: "☆ 관심종목 추가" })).toBeInTheDocument();
    expect(screen.queryByText("관심종목에 추가했습니다.")).not.toBeInTheDocument();
  });

  it("rejects successful daily responses with no valid candle and retries without caching", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({
      code: "005930",
      company: "삼성전자",
      candles: [],
      indicators: { rsi14: null, macd: null, macdSignal: null, macdHist: null, bbUpper: null, bbMiddle: null, bbLower: null },
      latestPrice: 0,
      latestChange: "",
      latestChangeRate: "",
    }));

    await expect(fetchChartData("005930", "삼성전자", "D")).rejects.toThrow("INVALID_CHART_DATA");
    const retried = await fetchChartData("005930", "삼성전자", "D");

    expect(retried.candles.length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/stock/chart?")).length).toBe(2);
  });

  it("loads chart data, draws normalized candles, and exposes chart controls", async () => {
    render(<ChartModal code="005930" company="삼성전자" onClose={vi.fn()} />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("삼성전자")).toBeInTheDocument();
    expect(await screen.findByText(/EMA 9/)).toBeInTheDocument();
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

  it("passes the selected US exchange to the daily chart endpoint", async () => {
    render(<ChartModal code="US:AAPL" company="Apple Inc." exchange="NAS" onClose={vi.fn()} />);
    await screen.findByRole("dialog");
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.startsWith("/api/stock/chart?") && url.includes("market=US") && url.includes("exchange=NAS"))).toBe(true);
    });
  });

  it("passes the selected Korean exchange to the daily chart endpoint", async () => {
    render(<ChartModal code="005930" company="삼성전자" exchange="KOSDAQ" onClose={vi.fn()} />);
    await screen.findByRole("dialog");
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.startsWith("/api/stock/chart?") && url.includes("market=KR") && url.includes("exchange=KOSDAQ"))).toBe(true);
    });
  });

  it("uses the exchange-scoped company name from stock lookup", async () => {
    render(<ChartModal code="005930" company="005930" exchange="KOSDAQ" onClose={vi.fn()} />);

    expect(await screen.findByText("거래소 지정 삼성전자")).toBeInTheDocument();
    const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
    expect(requests.some((url) => url.startsWith("/api/stock/lookup?") && url.includes("exchange=KOSDAQ"))).toBe(true);
  });

  it("refreshes company lookup when only the selected exchange changes", async () => {
    const onClose = vi.fn();
    const view = render(<ChartModal code="005930" company="005930" exchange="NAS" onClose={onClose} />);
    view.rerender(<ChartModal code="005930" company="005930" exchange="KOSDAQ" onClose={onClose} />);

    expect(await screen.findByText("거래소 지정 삼성전자")).toBeInTheDocument();
    const lookupUrls = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).filter((url) => url.startsWith("/api/stock/lookup?"));
    expect(lookupUrls.some((url) => url.includes("exchange=NAS"))).toBe(true);
    expect(lookupUrls.some((url) => url.includes("exchange=KOSDAQ"))).toBe(true);
  });

  it("passes the selected Korean exchange to the minute chart endpoint", async () => {
    render(<ChartModal code="005930" company="삼성전자" exchange="KOSDAQ" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));
    fireEvent.click(await screen.findByRole("button", { name: "국내 5분봉" }));

    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.startsWith("/api/kis/market-flow?") && url.includes("market=KR") && url.includes("mode=minute") && url.includes("exchange=KOSDAQ"))).toBe(true);
    });
  });

  it("passes the selected US exchange to the realtime approval endpoint", async () => {
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) {}
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));

    await waitFor(() => {
      const approvalUrl = vi.mocked(fetch).mock.calls.map(([input]) => String(input)).find((url) => url.startsWith("/api/kis/realtime/approval?"));
      expect(approvalUrl).toContain("market=US");
      expect(approvalUrl).toContain("exchange=NYS");
    });
  });

  it("decrypts encrypted realtime payloads and keeps approval keys out of rendered data", async () => {
    realtimeMocks.decrypt.mockResolvedValue("70000^100^+1");
    const sockets: Array<InstanceType<typeof MockWebSocket>> = [];
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => Promise<void> | void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));
    await waitFor(() => expect(sockets).toHaveLength(1));

    await act(async () => {
      await sockets[0].onmessage?.({ data: JSON.stringify({ header: { tr_id: "HDFSCNT0", encrypt: "Y" }, body: { rt_cd: "0" } }) } as MessageEvent);
      await sockets[0].onmessage?.({ data: "0|HDFSCNT0|001|ciphertext-without-key" } as MessageEvent);
    });
    expect(realtimeMocks.decrypt).not.toHaveBeenCalled();
    expect(screen.queryByText("ciphertext-without-key")).not.toBeInTheDocument();
    await waitFor(() => expect(sockets).toHaveLength(2), { timeout: 3000 });
    expect(sockets[0].close).toHaveBeenCalledWith(4000, "KIS realtime protocol recovery");

    await act(async () => {
      await sockets[1].onmessage?.({ data: JSON.stringify({ header: { tr_id: "HDFSCNT0", encrypt: "Y" }, body: { output: { key: "k".repeat(32), iv: "i".repeat(16) } } }) } as MessageEvent);
      await sockets[1].onmessage?.({ data: JSON.stringify({ header: { tr_id: "PINGPONG" } }) } as MessageEvent);
      await sockets[1].onmessage?.({ data: "0|HDFSASP0|001|wrong-subscription" } as MessageEvent);
      expect(realtimeMocks.decrypt).not.toHaveBeenCalled();
    });
    expect(screen.queryByText("실시간 key")).not.toBeInTheDocument();

    await act(async () => {
      await sockets[1].onmessage?.({ data: "0|HDFSCNT0|001|ciphertext" } as MessageEvent);
    });

    expect(realtimeMocks.decrypt).toHaveBeenCalledWith("ciphertext", "k".repeat(32), "i".repeat(16));
    expect(await screen.findByText("70000 | 100 | +1")).toBeInTheDocument();
    const persistedCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === "/api/kis/realtime/events");
    expect(JSON.parse(String(persistedCall?.[1]?.body)).payload.values).toBe("70000 | 100 | +1");
  });

  it("bounds queued realtime updates and processes the latest frame after slow decryption", async () => {
    let resolveFirst!: (plaintext: string) => void;
    const firstDecryption = new Promise<string>((resolve) => { resolveFirst = resolve; });
    realtimeMocks.decrypt.mockImplementation((ciphertext: string) => ciphertext === "frame-1" ? firstDecryption : Promise.resolve("new^values"));
    const sockets: Array<InstanceType<typeof MockWebSocket>> = [];
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => Promise<void> | void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));
    await waitFor(() => expect(sockets).toHaveLength(1));

    await act(async () => {
      sockets[0].onmessage?.({ data: JSON.stringify({ header: { tr_id: "HDFSCNT0", encrypt: "Y" }, body: { output: { key: "k".repeat(32), iv: "i".repeat(16) } } }) } as MessageEvent);
      sockets[0].onmessage?.({ data: "0|HDFSCNT0|001|frame-1" } as MessageEvent);
    });
    await waitFor(() => expect(realtimeMocks.decrypt).toHaveBeenCalledTimes(1));

    await act(async () => {
      for (let index = 2; index <= 40; index += 1) {
        sockets[0].onmessage?.({ data: `0|HDFSCNT0|001|frame-${index}` } as MessageEvent);
      }
    });
    expect(realtimeMocks.decrypt).toHaveBeenCalledTimes(1);
    resolveFirst("old^values");

    expect(await screen.findByText("new | values")).toBeInTheDocument();
    expect(screen.queryByText("old | values")).not.toBeInTheDocument();
    expect(realtimeMocks.decrypt).toHaveBeenCalledTimes(2);
    expect(realtimeMocks.decrypt).toHaveBeenLastCalledWith("frame-40", "k".repeat(32), "i".repeat(16));
  });

  it("fails closed and reconnects after control-frame queue overflow", async () => {
    let resolveDecrypt!: (plaintext: string) => void;
    const delayedDecryption = new Promise<string>((resolve) => { resolveDecrypt = resolve; });
    realtimeMocks.decrypt.mockImplementation((ciphertext: string) => ciphertext === "active-ciphertext" ? delayedDecryption : Promise.resolve("recovered^values"));
    const sockets: Array<InstanceType<typeof MockWebSocket>> = [];
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => Promise<void> | void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));
    await waitFor(() => expect(sockets).toHaveLength(1));

    await act(async () => {
      sockets[0].onmessage?.({ data: JSON.stringify({ header: { tr_id: "HDFSCNT0", encrypt: "Y" }, body: { output: { key: "k".repeat(32), iv: "i".repeat(16) } } }) } as MessageEvent);
      sockets[0].onmessage?.({ data: "0|HDFSCNT0|001|active-ciphertext" } as MessageEvent);
    });
    await waitFor(() => expect(realtimeMocks.decrypt).toHaveBeenCalledTimes(1));

    await act(async () => {
      for (let index = 0; index < 33; index += 1) {
        sockets[0].onmessage?.({ data: JSON.stringify({ header: { tr_id: `CONTROL${index}` } }) } as MessageEvent);
      }
      sockets[0].onmessage?.({ data: "0|HDFSCNT0|001|ciphertext-after-overflow" } as MessageEvent);
    });
    await act(async () => { resolveDecrypt("must-be-discarded^values"); });
    await waitFor(() => expect(screen.queryByText("ciphertext-after-overflow")).not.toBeInTheDocument());
    expect(screen.queryByText("must-be-discarded | values")).not.toBeInTheDocument();
    expect(realtimeMocks.decrypt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sockets).toHaveLength(2), { timeout: 3000 });
    expect(sockets[0].close).toHaveBeenCalledWith(4000, "KIS realtime protocol recovery");
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/kis/realtime/approval?")).length).toBe(2));

    await act(async () => {
      sockets[1].onmessage?.({ data: JSON.stringify({ header: { tr_id: "HDFSCNT0", encrypt: "Y" }, body: { output: { key: "n".repeat(32), iv: "j".repeat(16) } } }) } as MessageEvent);
      sockets[1].onmessage?.({ data: "0|HDFSCNT0|001|recovered-ciphertext" } as MessageEvent);
    });
    expect(await screen.findByText("recovered | values")).toBeInTheDocument();
    expect(realtimeMocks.decrypt).toHaveBeenLastCalledWith("recovered-ciphertext", "n".repeat(32), "j".repeat(16));
  });

  it("retries unexpected normal closes and stops after three failed retries", async () => {
    const sockets: Array<InstanceType<typeof MockWebSocket>> = [];
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => Promise<void> | void) | null = null;
      onerror: (() => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) { sockets.push(this); }
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));
    await waitFor(() => expect(sockets).toHaveLength(1));

    const delays = [500, 1_000, 2_000];
    for (let index = 0; index < delays.length; index += 1) {
      act(() => {
        sockets[index].onclose?.({ code: 1000 } as CloseEvent);
      });
      await waitFor(() => expect(sockets).toHaveLength(index + 2), { timeout: delays[index] + 1_500 });
    }

    act(() => { sockets[3].onclose?.({ code: 1006 } as CloseEvent); });
    await new Promise((resolve) => setTimeout(resolve, 600));

    expect(sockets).toHaveLength(4);
    expect(sockets[3].close).toHaveBeenCalledWith(4001, "KIS realtime retry limit reached");
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/kis/realtime/approval?")).length).toBe(4);

    fireEvent.click(screen.getByRole("tab", { name: "차트" }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "차트" })).toHaveAttribute("aria-selected", "true"));
    fireEvent.click(screen.getByRole("tab", { name: "수급" }));
    await waitFor(() => expect(sockets).toHaveLength(5));
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).startsWith("/api/kis/realtime/approval?")).length).toBe(5);
  });

  it("honors Retry-After on rate-limited realtime approval responses", async () => {
    const approvalUrl = "/api/kis/realtime/approval?";
    const fetchMock = vi.mocked(fetch);
    const defaultImplementation = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((input, init) => String(input).startsWith(approvalUrl)
      ? Promise.resolve(Response.json({ ok: false, error: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": "7" } }))
      : defaultImplementation!(input, init));
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    class MockWebSocket {
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) {}
    }
    vi.stubGlobal("WebSocket", MockWebSocket);
    const view = render(<ChartModal code="US:IBM" company="IBM" exchange="NYS" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("tab", { name: "수급" }));

    await waitFor(() => expect(timeoutSpy.mock.calls.some(([, delay]) => delay === 7_000)).toBe(true));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).startsWith(approvalUrl))).toHaveLength(1);
    view.unmount();
  });

  it("shows an error for an empty validated minute chart and retries instead of caching it", async () => {
    chartMocks.minuteRows = [{ stck_bsop_date: "20261131", stck_cntg_hour: "093000", stck_oprc: "100", stck_hgpr: "105", stck_lwpr: "98", stck_prpr: "102", cntg_vol: "50" }];
    render(<ChartModal code="005930" company="삼성전자" exchange="KOSDAQ" onClose={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "1분봉 차트 보기" }));
    expect(await screen.findByText("KIS_MINUTE_DATA_EMPTY_OR_INVALID")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "일봉" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "일봉" })).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(screen.getByRole("button", { name: "1분봉 차트 보기" }));
    await waitFor(() => {
      const minuteRequests = vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes("/api/kis/market-flow?") && String(input).includes("minute=1"));
      expect(minuteRequests).toHaveLength(2);
    });
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
    expect(screen.getByRole("button", { name: "일봉" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => {
      const requests = vi.mocked(fetch).mock.calls.map(([input]) => String(input));
      expect(requests.some((url) => url.includes("/api/stock/chart?") && url.includes("timeframe=D"))).toBe(true);
    });
  });
});
