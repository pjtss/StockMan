import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearKisRealtimeApprovalKeyCacheForTest } from "@/lib/kis-realtime";
import { resetKisRealtimeApprovalLimitsForTest } from "@/lib/kis-realtime-approval-rate-limit";
import { GET } from "./route";

describe("KIS realtime approval API", () => {
  beforeEach(() => {
    clearKisRealtimeApprovalKeyCacheForTest();
    resetKisRealtimeApprovalLimitsForTest();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("rejects invalid market or instrument code before requesting an approval key", async () => {
    const response = await GET(new Request("https://local/api/kis/realtime/approval?market=KR&code=BAD"));
    expect(response.status).toBe(400);
  });

  it("returns the websocket subscription frame when approval succeeds", async () => {
    vi.stubEnv("KIS_APPKEY", "app-key");
    vi.stubEnv("KIS_APPSECRET", "app-secret");
    const fetchMock = vi.fn(async () => Response.json({ approval_key: "approval-key" }));
    vi.stubGlobal("fetch", fetchMock);
    const response = await GET(new Request("https://local/api/kis/realtime/approval?market=KR&channel=trade&code=005930"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, market: "KR", channel: "trade", code: "005930" });
    expect(JSON.parse(body.frame).header.approval_key).toBe("approval-key");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("maps provider failures to a stable 503 response without exposing exception text", async () => {
    vi.stubEnv("KIS_APPKEY", "app-key");
    vi.stubEnv("KIS_APPSECRET", "app-secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("database password / provider secret"); }));
    const response = await GET(new Request("https://local/api/kis/realtime/approval?market=KR&code=005930"));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "KIS_APPROVAL_KEY_UNAVAILABLE" });
  });

  it("returns 429 with Retry-After when a client exceeds the public limit", async () => {
    vi.stubEnv("KIS_APPKEY", "app-key");
    vi.stubEnv("KIS_APPSECRET", "app-secret");
    const fetchMock = vi.fn(async () => Response.json({ approval_key: "approval-key" }));
    vi.stubGlobal("fetch", fetchMock);
    const request = () => new Request("https://local/api/kis/realtime/approval?market=KR&code=005930", { headers: { "x-real-ip": "192.0.2.99" } });

    for (let index = 0; index < 120; index += 1) expect((await GET(request())).status).toBe(200);
    const limited = await GET(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(await limited.json()).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
