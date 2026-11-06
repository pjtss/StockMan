import { beforeEach, describe, expect, it, vi } from "vitest";

const { consumeSecStockRiskLimit, materializeStockmanSecEvents, materializeStockmanRssEvents } = vi.hoisted(() => ({
  consumeSecStockRiskLimit: vi.fn(), materializeStockmanSecEvents: vi.fn(), materializeStockmanRssEvents: vi.fn(),
}));
vi.mock("@/lib/sec-stock-risk-public-rate-limit", () => ({ consumeSecStockRiskLimit }));
vi.mock("@/lib/stockman-events", () => ({ materializeStockmanSecEvents, materializeStockmanRssEvents }));

import { POST } from "./route";

describe("POST /api/events/collect", () => {
  beforeEach(() => {
    consumeSecStockRiskLimit.mockReset().mockReturnValue({ allowed: true, retryAfterSeconds: 0 });
    materializeStockmanSecEvents.mockReset().mockResolvedValue({ status: "SUCCESS", fetched: 1, stored: 1, unverified: 0, failed: 0 });
    materializeStockmanRssEvents.mockReset().mockResolvedValue({ status: "SUCCESS", fetched: 1, stored: 1, failed: 0 });
  });

  it("allows unauthenticated materialization by existing SEC accession only", async () => {
    const response = await POST(new Request("https://stockman.example/api/events/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "SEC_EDGAR", accession: "0000123456-26-000123" }) }));
    expect(response.status).toBe(200);
    expect(materializeStockmanSecEvents).toHaveBeenCalledWith(1, "0000123456-26-000123");
  });

  it("rejects attempts to submit arbitrary event fields", async () => {
    const response = await POST(new Request("https://stockman.example/api/events/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "SEC_EDGAR", accession: "0000123456-26-000123", ticker: "INO", grade: "A" }) }));
    expect(response.status).toBe(400);
    expect(materializeStockmanSecEvents).not.toHaveBeenCalled();
  });

  it("keeps RSS materialized records unverified by the source materializer", async () => {
    const response = await POST(new Request("https://stockman.example/api/events/collect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source: "RSS", provider: "STOCKTITAN", externalId: "record-1" }) }));
    expect(response.status).toBe(200);
    expect(materializeStockmanRssEvents).toHaveBeenCalledWith(1, "STOCKTITAN", "record-1");
  });

  it("returns throttling without touching storage", async () => {
    consumeSecStockRiskLimit.mockReturnValueOnce({ allowed: false, retryAfterSeconds: 12 });
    const response = await POST(new Request("https://stockman.example/api/events/collect", { method: "POST", body: "{}" }));
    expect(response.status).toBe(429);
    expect(materializeStockmanSecEvents).not.toHaveBeenCalled();
    expect(materializeStockmanRssEvents).not.toHaveBeenCalled();
  });
});
