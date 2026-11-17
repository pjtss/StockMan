import { beforeEach, describe, expect, it, vi } from "vitest";

const { writeKisRealtimeEvent, consumeKisRealtimeEventLimit } = vi.hoisted(() => ({
  writeKisRealtimeEvent: vi.fn(),
  consumeKisRealtimeEventLimit: vi.fn(),
}));
vi.mock("@/lib/kis-realtime-event", () => ({ writeKisRealtimeEvent }));
vi.mock("@/lib/kis-realtime-event-rate-limit", () => ({ consumeKisRealtimeEventLimit }));

import { POST } from "./route";

function eventRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://stockman.example/api/kis/realtime/events", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/kis/realtime/events", () => {
  beforeEach(() => {
    consumeKisRealtimeEventLimit.mockReset().mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    writeKisRealtimeEvent.mockReset().mockResolvedValue(undefined);
  });

  it("stores a validated realtime observation", async () => {
    const response = await POST(eventRequest({ market: "US", code: "US:IBM", channel: "trade", trId: "HDFSCNT0", payload: { tr_id: "HDFSCNT0", values: "100^2" }, rawPayload: "0|HDFSCNT0|001|ciphertext" }, { "x-real-ip": "192.0.2.8" }));

    expect(response.status).toBe(200);
    expect(consumeKisRealtimeEventLimit).toHaveBeenCalledWith("192.0.2.8");
    expect(writeKisRealtimeEvent).toHaveBeenCalledWith(expect.objectContaining({ market: "US", code: "IBM", channel: "trade", trId: "HDFSCNT0" }));
  });

  it("rejects mismatched transaction ids and does not store them", async () => {
    const response = await POST(eventRequest({ market: "KR", code: "005930", channel: "trade", trId: "H0STASP0", payload: { tr_id: "H0STASP0", values: "x" } }));

    expect(response.status).toBe(400);
    expect(writeKisRealtimeEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized chunked request bodies even without Content-Length", async () => {
    const response = await POST(new Request("https://stockman.example/api/kis/realtime/events", {
      method: "POST",
      body: JSON.stringify({ market: "KR", code: "005930", channel: "trade", trId: "H0STCNT0", payload: { tr_id: "H0STCNT0", values: "x" }, rawPayload: "x".repeat(25_000) }),
    }));

    expect(response.status).toBe(413);
    expect(writeKisRealtimeEvent).not.toHaveBeenCalled();
  });

  it("returns Retry-After without writing when rate limited", async () => {
    consumeKisRealtimeEventLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 9 });
    const response = await POST(eventRequest({}));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("9");
    expect(writeKisRealtimeEvent).not.toHaveBeenCalled();
  });

  it("maps storage errors to a stable 503 response", async () => {
    writeKisRealtimeEvent.mockRejectedValueOnce(new Error("database password"));
    const response = await POST(eventRequest({ market: "KR", code: "005930", channel: "trade", trId: "H0STCNT0", payload: { tr_id: "H0STCNT0", values: "x" } }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "REALTIME_EVENT_STORAGE_UNAVAILABLE" });
  });
});
