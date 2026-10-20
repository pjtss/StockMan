import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntradayDetectionPage } from "./intraday-detection-page";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IntradayDetectionPage", () => {
  it("shows rolling turnover from minute-candle samples and marks incomplete windows", async () => {
    const turnoverWindows = Array.from({ length: 10 }, (_, index) => {
      const minutes = index + 1;
      const complete = minutes === 1 || minutes === 10;
      return {
        minutes,
        tradingValue: minutes === 1 ? 75 : minutes === 10 ? 550 : null,
        turnoverRatio: minutes === 1 ? 0.0015 : minutes === 10 ? 0.011 : null,
        sampleCount: complete ? minutes : 5,
        requiredSamples: minutes,
        complete,
      };
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      criteria: { windowMinutes: 1, requiredSamples: 1, minTurnoverToMarketCapPercent: 1, bucketMinutes: 1, retainedTurnoverMinutes: 10 },
      status: { worker: { status: "RUNNING" }, usFocusPoolCount: 1 },
      items: [],
      usFocusItems: [{ market: "NAS", code: "TEST", name: "Test Corp", rank: 1, currency: "USD", status: "ACTIVE", state: "TRACKING", turnoverWindows, lastObservedAt: "2026-10-06T01:02:00.000Z" }],
      collectedAt: "2026-10-06T01:02:00.000Z",
    }), { status: 200, headers: { "content-type": "application/json" } })));

    render(<IntradayDetectionPage />);

    expect(await screen.findByText("미국 TOP100 집중 관측 · 최근 거래대금")).toBeInTheDocument();
    expect(screen.getByText("$75")).toBeInTheDocument();
    expect(screen.getByText("$550")).toBeInTheDocument();
    expect(screen.getByText("5/3봉")).toBeInTheDocument();
  });
});
