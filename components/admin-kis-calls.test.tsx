import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminKisCalls } from "./admin-kis-calls";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminKisCalls", () => {
  it("keeps required call totals visible when both optional metrics APIs fail", async () => {
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const url = String(input);
      if (url.startsWith("/api/debug/kis-calls")) {
        return Promise.resolve(Response.json({
          summary: { calls: 42, success: 40, failures: 2, avg_duration_ms: 12, max_duration_ms: 31 },
          daily: [],
          hourly: [],
          features: [],
        }));
      }
      if (url.startsWith("/api/admin/kis-rate-limits")) return Promise.reject(new Error("network down"));
      if (url === "/api/admin/kis-realtime-approval-metrics") return Promise.resolve(new Response("unavailable", { status: 503 }));
      return Promise.reject(new Error(`Unexpected URL: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminKisCalls />);

    expect(await screen.findByText("42회")).toBeDefined();
    expect(screen.getByText("KIS RATE LIMIT 집계를 불러오지 못했습니다. 실제 KIS 호출량은 계속 표시됩니다.")).toBeDefined();
    expect(screen.getByText("차트 Approval 제한 메트릭을 불러오지 못했습니다. 다른 KIS 호출 집계에는 영향이 없습니다.")).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
