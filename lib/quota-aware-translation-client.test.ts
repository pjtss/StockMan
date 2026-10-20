import { describe, expect, it, vi } from "vitest";
import { createQuotaAwareTranslationClient } from "./quota-aware-translation-client";
import type { TranslationClient } from "./translation-types";

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    loadCache: vi.fn(async () => null),
    deleteCache: vi.fn(async () => undefined),
    saveCache: vi.fn(async () => 5),
    reserve: vi.fn(async () => ({ allowed: true, used: 5, limitReached: false })),
    release: vi.fn(async () => undefined),
    recordTranslated: vi.fn(async () => undefined),
    getUsageMonth: vi.fn(() => "2026-09"),
    ...overrides,
  } as any;
}

const translated = (text: string): TranslationClient => ({
  translate: vi.fn(async (input) => ({ translatedText: `ko:${input}`, source: "en", target: "ko", provider: "google-cloud-translation", fallback: false })),
});

describe("quota-aware translation client", () => {
  it("uses cache without reserving quota or calling the provider", async () => {
    const deps = dependencies({ loadCache: vi.fn(async () => ({ translatedText: "cached", provider: "google-cloud-translation", characterCount: 5 })) });
    const provider = translated("hello");
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    await expect(tracked.client.translate("hello")).resolves.toMatchObject({ translatedText: "cached", fallback: false, requestOrigin: "CACHE" });
    expect(deps.reserve).not.toHaveBeenCalled();
    expect(provider.translate).not.toHaveBeenCalled();
    expect(tracked.getMetrics().cacheHits).toBe(1);
  });

  it("returns an explicit quota fallback when reservation is denied", async () => {
    const deps = dependencies({ reserve: vi.fn(async () => ({ allowed: false, used: 300_000, limitReached: true })) });
    const onUsage = vi.fn(async (_used: number, _month: string, _quotaExceeded: boolean) => undefined);
    const provider = translated("hello");
    const tracked = createQuotaAwareTranslationClient(provider, onUsage, deps);

    await expect(tracked.client.translate("hello")).resolves.toMatchObject({ fallback: true, fallbackReason: "monthly_character_limit_reached", requestOrigin: "QUOTA_FALLBACK" });
    expect(deps.reserve).toHaveBeenCalledWith(5, "2026-09");
    expect(onUsage).toHaveBeenCalledWith(300_000, "2026-09", true);
    expect(provider.translate).not.toHaveBeenCalled();
    expect(tracked.getMetrics()).toMatchObject({ quotaFallbacks: 1, apiCalls: 0, reservedCharacters: 0, translatedCharacters: 0 });
  });

  it("records, caches, and accounts successful provider translations", async () => {
    const deps = dependencies();
    const provider = translated("hello");
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    await expect(tracked.client.translate("hello")).resolves.toMatchObject({ translatedText: "ko:hello", requestOrigin: "PROVIDER" });
    expect(deps.reserve).toHaveBeenCalledWith(5, "2026-09");
    expect(deps.saveCache).toHaveBeenCalledWith("hello", "ko:hello", "google-cloud-translation", "en", "ko");
    expect(deps.recordTranslated).toHaveBeenCalledWith(5, "2026-09");
    expect(tracked.getMetrics()).toMatchObject({ apiCalls: 1, translatedCharacters: 5, reservedCharacters: 5 });
  });

  it("separates HTML and text cache entries and forwards the selected translation format", async () => {
    const deps = dependencies();
    const provider = translated("<p>Hello</p>");
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    await tracked.client.translate("<p>Hello</p>", "en", "ko", "html");

    expect(deps.loadCache).toHaveBeenCalledWith("<p>Hello</p>", "google-cloud-translation:html", "ko");
    expect(deps.saveCache).toHaveBeenCalledWith("<p>Hello</p>", "ko:<p>Hello</p>", "google-cloud-translation:html", "en", "ko");
    expect(provider.translate).toHaveBeenCalledWith("<p>Hello</p>", "en", "ko", "html");
  });

  it("keeps a valid provider result when the optional cache write fails", async () => {
    const deps = dependencies({ saveCache: vi.fn(async () => { throw new Error("cache unavailable"); }) });
    const tracked = createQuotaAwareTranslationClient(translated("hello"), undefined, deps);

    await expect(tracked.client.translate("hello")).resolves.toMatchObject({ translatedText: "ko:hello", requestOrigin: "PROVIDER" });
    expect(deps.recordTranslated).toHaveBeenCalledWith(5, "2026-09");
    expect(tracked.getMetrics()).toMatchObject({ apiCalls: 1, cacheWriteFailures: 1, usageRecordFailures: 0, reservedCharacters: 5 });
  });

  it("keeps reserved quota and a valid result when the secondary usage counter fails", async () => {
    const deps = dependencies({ recordTranslated: vi.fn(async () => { throw new Error("usage counter unavailable"); }) });
    const tracked = createQuotaAwareTranslationClient(translated("hello"), undefined, deps);

    await expect(tracked.client.translate("hello")).resolves.toMatchObject({ translatedText: "ko:hello", requestOrigin: "PROVIDER" });
    expect(deps.saveCache).toHaveBeenCalledOnce();
    expect(tracked.getMetrics()).toMatchObject({ apiCalls: 1, usageRecordFailures: 1, reservedCharacters: 5, translatedCharacters: 0 });
  });

  it("releases reserved characters when the provider fails", async () => {
    const deps = dependencies();
    const provider: TranslationClient = { translate: vi.fn(async () => { throw new Error("HTTP 503"); }) };
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    const pending = tracked.client.translate("hello");
    await expect(pending).rejects.toThrow("HTTP 503");
    await expect(pending).rejects.toMatchObject({ stage: "provider_request" });
    expect(deps.release).toHaveBeenCalledWith(5, "2026-09");
    expect(tracked.getMetrics()).toMatchObject({ apiFailures: 1, reservedCharacters: 0 });
  });

  it("reports reservation-release failure without hiding the provider failure", async () => {
    const deps = dependencies({ release: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const provider: TranslationClient = { translate: vi.fn(async () => { throw new Error("HTTP 503"); }) };
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    await expect(tracked.client.translate("hello")).rejects.toMatchObject({
      stage: "provider_request",
      message: "HTTP 503 (quota reservation release also failed)",
      cleanupError: expect.objectContaining({ message: "database unavailable" }),
    });
    expect(tracked.getMetrics()).toMatchObject({ apiFailures: 1, reservationReleaseFailures: 1, reservedCharacters: 5 });
  });

  it("identifies cache and reservation failures without claiming a provider request", async () => {
    const cacheFailure = createQuotaAwareTranslationClient(translated("hello"), undefined, dependencies({
      loadCache: vi.fn(async () => { throw new Error("cache unavailable"); }),
    }));
    await expect(cacheFailure.client.translate("hello")).rejects.toMatchObject({ stage: "cache_read" });

    const reservationFailure = createQuotaAwareTranslationClient(translated("hello"), undefined, dependencies({
      reserve: vi.fn(async () => { throw new Error("quota unavailable"); }),
    }));
    await expect(reservationFailure.client.translate("hello")).rejects.toMatchObject({ stage: "quota_reservation" });
  });

  it("coalesces concurrent identical titles into one billed provider request", async () => {
    const deps = dependencies();
    let resolveProvider!: (value: Awaited<ReturnType<TranslationClient["translate"]>>) => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => { markProviderStarted = resolve; });
    const provider: TranslationClient = {
      translate: vi.fn(() => new Promise((resolve) => { resolveProvider = resolve; markProviderStarted(); })),
    };
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);
    const first = tracked.client.translate("same title");
    const second = tracked.client.translate("same title");
    await providerStarted;
    resolveProvider({ translatedText: "같은 제목", source: "en", target: "ko", provider: "google-cloud-translation", fallback: false });

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(deps.reserve).toHaveBeenCalledOnce();
    expect(provider.translate).toHaveBeenCalledOnce();
    expect(tracked.getMetrics().apiCalls).toBe(1);
  });

  it("reserves monthly quota in invocation order even when later cache reads finish first", async () => {
    let resolveFirstCache!: (value: null) => void;
    let markSecondCacheRead!: () => void;
    const firstCacheRead = new Promise<null>((resolve) => { resolveFirstCache = resolve; });
    const secondCacheRead = new Promise<void>((resolve) => { markSecondCacheRead = resolve; });
    const reserveOrder: number[] = [];
    const deps = dependencies({
      loadCache: vi.fn(async (text: string) => {
        if (text === "priority") return firstCacheRead;
        markSecondCacheRead();
        return null;
      }),
      reserve: vi.fn(async (characters: number) => {
        reserveOrder.push(characters);
        return { allowed: true, used: characters, limitReached: false };
      }),
    });
    const tracked = createQuotaAwareTranslationClient(translated("any"), undefined, deps);

    const first = tracked.client.translate("priority");
    const second = tracked.client.translate("later");
    await secondCacheRead;
    expect(deps.reserve).not.toHaveBeenCalled();

    resolveFirstCache(null);
    await Promise.all([first, second]);

    expect(reserveOrder).toEqual([8, 5]);
    expect(deps.reserve.mock.invocationCallOrder[0]).toBeLessThan(deps.reserve.mock.invocationCallOrder[1]);
    expect(tracked.getMetrics().apiCalls).toBe(2);
  });

  it("counts supplementary Unicode characters once for Google quota accounting", async () => {
    const deps = dependencies();
    const provider = translated("🚀a");
    const tracked = createQuotaAwareTranslationClient(provider, undefined, deps);

    await tracked.client.translate("🚀a");

    expect(deps.reserve).toHaveBeenCalledWith(2, "2026-09");
    expect(deps.saveCache).toHaveBeenCalledWith("🚀a", "ko:🚀a", "google-cloud-translation", "en", "ko");
    expect(deps.recordTranslated).toHaveBeenCalledWith(2, "2026-09");
    expect(tracked.getMetrics()).toMatchObject({ reservedCharacters: 2, translatedCharacters: 2 });
  });

  it("records a translation against the month reserved even if the provider call crosses UTC month start", async () => {
    const getUsageMonth = vi.fn(() => "2026-09");
    const deps = dependencies({ getUsageMonth });
    const provider: TranslationClient = {
      translate: vi.fn(async (input) => {
        getUsageMonth.mockReturnValue("2026-10");
        return { translatedText: `ko:${input}`, source: "en", target: "ko", provider: "google-cloud-translation", fallback: false };
      }),
    };
    const onUsage = vi.fn(async () => undefined);
    const tracked = createQuotaAwareTranslationClient(provider, onUsage, deps);

    await tracked.client.translate("hello");

    expect(deps.reserve).toHaveBeenCalledWith(5, "2026-09");
    expect(deps.recordTranslated).toHaveBeenCalledWith(5, "2026-09");
    expect(onUsage).toHaveBeenCalledWith(5, "2026-09", false);
  });

  it("defers cache writes until the caller approves a validated provider result", async () => {
    const deps = dependencies();
    const tracked = createQuotaAwareTranslationClient(translated("hello"), undefined, deps, { deferCacheWriteUntilValidated: true });

    await expect(tracked.client.translate("hello", "auto", "ko", "html")).resolves.toMatchObject({ requestOrigin: "PROVIDER" });
    expect(deps.saveCache).not.toHaveBeenCalled();

    await tracked.client.commitCache?.("hello", "auto", "ko", "html");
    await tracked.client.commitCache?.("hello", "auto", "ko", "html");
    expect(deps.saveCache).toHaveBeenCalledOnce();
    expect(deps.saveCache).toHaveBeenCalledWith("hello", "ko:hello", "google-cloud-translation:html", "auto", "ko");
  });

  it("invalidates a cached response that fails downstream validation", async () => {
    let staleCacheExists = true;
    const deps = dependencies({
      loadCache: vi.fn(async () => staleCacheExists ? { translatedText: "malformed cached response", provider: "google-cloud-translation", characterCount: 10 } : null),
      deleteCache: vi.fn(async () => { staleCacheExists = false; }),
    });
    const tracked = createQuotaAwareTranslationClient(translated("hello"), undefined, deps, { deferCacheWriteUntilValidated: true });

    await expect(tracked.client.invalidateCache?.("hello", "auto", "ko", "html")).resolves.toBe(true);

    expect(deps.deleteCache).toHaveBeenCalledWith("hello", "google-cloud-translation:html", "ko");
    expect(tracked.getMetrics().cacheInvalidations).toBe(1);
    await expect(tracked.client.translate("hello", "auto", "ko", "html")).resolves.toMatchObject({ requestOrigin: "PROVIDER" });
    expect(deps.reserve).toHaveBeenCalledOnce();
  });

  it("reports cache invalidation failure so callers cannot treat a stale entry as removed", async () => {
    const deps = dependencies({ deleteCache: vi.fn(async () => { throw new Error("database unavailable"); }) });
    const tracked = createQuotaAwareTranslationClient(translated("hello"), undefined, deps, { deferCacheWriteUntilValidated: true });

    await expect(tracked.client.invalidateCache?.("hello", "auto", "ko", "html")).resolves.toBe(false);

    expect(tracked.getMetrics().cacheInvalidations).toBe(0);
    expect(tracked.getMetrics().cacheInvalidationFailures).toBe(1);
  });
});
