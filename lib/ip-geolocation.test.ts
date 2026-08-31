import { describe, expect, it, vi } from "vitest";
import { resolveIpLocation } from "./ip-geolocation";

describe("IP geolocation", () => {
  it("skips private and IPv6 addresses without a provider", async () => {
    expect((await resolveIpLocation("192.168.0.1")).source).toBe("unknown");
    expect((await resolveIpLocation("2001:db8::1")).source).toBe("unknown");
  });
  it("returns unknown when provider is not configured", async () => {
    vi.stubEnv("IP_GEOLOCATION_API_URL", "");
    expect(await resolveIpLocation("8.8.8.8")).toMatchObject({ countryCode: null, source: "unknown" });
    vi.unstubAllEnvs();
  });
  it("isolates provider failures", async () => {
    vi.stubEnv("IP_GEOLOCATION_API_URL", "https://geo.invalid");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect((await resolveIpLocation("8.8.8.8")).confidence).toBe("unknown");
    vi.unstubAllEnvs();
  });
});
