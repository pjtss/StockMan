import { describe, expect, it, vi } from "vitest";
import { fetchOptionalJson } from "./admin-optional-json";

describe("fetchOptionalJson", () => {
  it("returns JSON for a successful optional section request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ total: 3 }));

    await expect(fetchOptionalJson(fetcher, "/api/optional")).resolves.toEqual({
      value: { total: 3 },
      available: true,
    });
    expect(fetcher).toHaveBeenCalledWith("/api/optional", { cache: "no-store" });
  });

  it("isolates HTTP errors from the required dashboard sections", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(fetchOptionalJson(fetcher, "/api/optional")).resolves.toEqual({
      value: null,
      available: false,
    });
  });

  it("isolates network and malformed JSON errors", async () => {
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error("network down"));
    const malformedJson = vi.fn<typeof fetch>().mockResolvedValue(new Response("not-json", { status: 200 }));

    await expect(fetchOptionalJson(networkFailure, "/api/optional")).resolves.toEqual({ value: null, available: false });
    await expect(fetchOptionalJson(malformedJson, "/api/optional")).resolves.toEqual({ value: null, available: false });
  });
});
