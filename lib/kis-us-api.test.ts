import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getAccessToken: vi.fn(), loadConfig: vi.fn(), kisRequest: vi.fn() }));
vi.mock("@/lib/kis", () => ({ getAccessToken: mocks.getAccessToken }));
vi.mock("@/lib/kis-api-config", () => ({ loadKisApiConfig: mocks.loadConfig }));
vi.mock("@/lib/kis-request-framework", () => ({ kisRequest: mocks.kisRequest }));

import { fetchKisUsTopRisingApi } from "./kis-us-api";

beforeEach(() => {
  mocks.getAccessToken.mockReset().mockResolvedValue("test-token");
  mocks.loadConfig.mockReset().mockResolvedValue({ content_type: "application/json", custtype: "P" });
  mocks.kisRequest.mockReset();
});

describe("KIS US TOP rising API success classification", () => {
  it("requires rt_cd 0 in addition to HTTP success", async () => {
    mocks.kisRequest.mockResolvedValue({ response: new Response("{}", { status: 200 }), rawText: "{}", parsed: { rt_cd: "0", output2: [] } });
    await expect(fetchKisUsTopRisingApi()).resolves.toMatchObject({ ok: true, status: 200 });

    mocks.kisRequest.mockResolvedValue({ response: new Response("{}", { status: 200 }), rawText: "{}", parsed: { rt_cd: "1", msg1: "provider error" } });
    await expect(fetchKisUsTopRisingApi()).resolves.toMatchObject({ ok: false, status: 200 });
  });

  it("fails closed when the HTTP 200 body has no KIS success code", async () => {
    mocks.kisRequest.mockResolvedValue({ response: new Response("{}", { status: 200 }), rawText: "{}", parsed: { output2: [{ symb: "AAA" }] } });
    await expect(fetchKisUsTopRisingApi()).resolves.toMatchObject({ ok: false, response: { parsed: { output2: [{ symb: "AAA" }] } } });
  });
});
