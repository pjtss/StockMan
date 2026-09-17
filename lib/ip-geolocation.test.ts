import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveIpLocation } from "./ip-geolocation";

describe("IP geolocation resolver", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("caches the result for repeated IP lookups", async () => {
    vi.stubEnv("IP_GEOLOCATION_API_URL", "https://geo.test");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ country_code: "KR", city: "Seoul" }), { status: 200 }));

    await expect(resolveIpLocation("203.0.113.10")).resolves.toMatchObject({ countryCode: "KR", city: "Seoul" });
    await expect(resolveIpLocation("203.0.113.10")).resolves.toMatchObject({ countryCode: "KR", city: "Seoul" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shares an in-flight lookup for concurrent requests", async () => {
    vi.stubEnv("IP_GEOLOCATION_API_URL", "https://geo.test");
    let resolveResponse!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { resolveResponse = resolve; });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(pending);

    const first = resolveIpLocation("203.0.113.11");
    const second = resolveIpLocation("203.0.113.11");
    resolveResponse(new Response(JSON.stringify({ country_code: "US" }), { status: 200 }));
    await expect(Promise.all([first, second])).resolves.toEqual([expect.objectContaining({ countryCode: "US" }), expect.objectContaining({ countryCode: "US" })]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
