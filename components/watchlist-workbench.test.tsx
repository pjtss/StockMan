import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WatchlistWorkbench } from "./watchlist-workbench";

const chartModal = vi.fn();
vi.mock("@/components/chart-modal", () => ({
  ChartModal: (props: Record<string, unknown>) => {
    chartModal(props);
    return <div data-testid="chart-modal" />;
  },
}));

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

describe("WatchlistWorkbench", () => {
  beforeEach(() => {
    chartModal.mockClear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("/api/watchlist") && (!init?.method || init.method === "GET")) {
        return jsonResponse({ items: [{ market: "KR", code: "005930" }, { market: "US", code: "AAPL" }] });
      }
      if (url.includes("/api/stock/lookup?market=KR")) return jsonResponse({ names: { "005930": "삼성전자" } });
      if (url.includes("/api/stock/lookup?market=US")) return jsonResponse({ names: { AAPL: "Apple Inc." } });
      return jsonResponse({ ok: true });
    }));
  });

  it("renders both markets with resolved company names", async () => {
    render(<WatchlistWorkbench />);

    expect(await screen.findByText("삼성전자")).toBeInTheDocument();
    expect(await screen.findByText("Apple Inc.")).toBeInTheDocument();
    expect(screen.getByText("005930 · 국내")).toBeInTheDocument();
    expect(screen.getByText("AAPL · 해외")).toBeInTheDocument();
  });

  it("opens the shared modal with position, adjacent prefetch, and navigation callbacks", async () => {
    render(<WatchlistWorkbench />);
    await screen.findByText("삼성전자");

    fireEvent.click(screen.getAllByRole("button", { name: "차트 보기" })[0]);
    await waitFor(() => expect(chartModal).toHaveBeenCalled());
    const firstProps = chartModal.mock.lastCall[0];
    expect(firstProps).toMatchObject({
      code: "005930",
      company: "삼성전자",
      position: { current: 1, total: 2 },
      prefetchCodes: [{ code: "US:AAPL", company: "Apple Inc." }],
    });
    expect(firstProps.onPrevious).toBeUndefined();
    expect(firstProps.onNext).toEqual(expect.any(Function));

    await act(async () => firstProps.onNext());
    await waitFor(() => expect(chartModal.mock.lastCall[0]).toMatchObject({ code: "US:AAPL", company: "Apple Inc.", position: { current: 2, total: 2 } }));
    expect(chartModal.mock.lastCall[0].onPrevious).toEqual(expect.any(Function));
    expect(chartModal.mock.lastCall[0].onNext).toBeUndefined();
  });

  it("sends the selected item to DELETE and closes its modal", async () => {
    const fetchMock = vi.mocked(fetch);
    render(<WatchlistWorkbench />);
    await screen.findByText("삼성전자");
    fireEvent.click(screen.getAllByRole("button", { name: "차트 보기" })[0]);
    await waitFor(() => expect(screen.getByTestId("chart-modal")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "005930 삭제" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/watchlist", expect.objectContaining({ method: "DELETE" })));
    expect(screen.queryByTestId("chart-modal")).not.toBeInTheDocument();
  });
});
