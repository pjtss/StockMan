import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  writeDebugLog: vi.fn(),
  recordDebugKisCall: vi.fn(),
  recordKisRateLimitEvent: vi.fn(),
}));

vi.mock("@/lib/kis-authorization", () => ({ buildKisAuthorization: (token: string) => `Bearer ${token}` }));
vi.mock("@/lib/kis-request-throttle", () => ({
  classifyKisFailure: () => null,
  withKisRequestThrottle: (run: () => Promise<unknown>) => run(),
}));
vi.mock("@/lib/debug-context", () => ({ createDebugContext: () => ({ requestId: "test-request", market: "US" }) }));
vi.mock("@/lib/debug-logger", () => ({ writeDebugLog: mocks.writeDebugLog }));
vi.mock("@/lib/debug-kis-call", () => ({ recordDebugKisCall: mocks.recordDebugKisCall }));
vi.mock("@/lib/kis-rate-limit-event", () => ({ recordKisRateLimitEvent: mocks.recordKisRateLimitEvent }));

import { kisRequest } from "./kis-request-framework";

describe("KIS request framework safe diagnostics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not persist a raw network exception message to debug logs", async () => {
    const secretUrl = "postgres://dbuser:db-password@db.example/stockman";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error(`connect failed ${secretUrl} token=secret-token`)));

    await expect(kisRequest({ url: "https://openapi.example.test/quote", token: "kis-token", trId: "TR123" })).rejects.toThrow(secretUrl);

    const output = JSON.stringify(mocks.writeDebugLog.mock.calls);
    expect(output).not.toContain("db-password");
    expect(output).not.toContain("secret-token");
    expect(output).toContain("INTEGRATION_ERROR");
  });
});
