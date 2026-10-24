import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireAdminSession: vi.fn(),
  isCronRequestAuthorized: vi.fn(),
  getPool: vi.fn(),
  azureClient: vi.fn(),
  createQuotaAwareTranslationClient: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ requireAdminSession: state.requireAdminSession }));
vi.mock("@/lib/cron-auth", () => ({ isCronRequestAuthorized: state.isCronRequestAuthorized }));
vi.mock("@/lib/db", () => ({ getPool: state.getPool }));
vi.mock("@/lib/azure-translation-client", () => ({ AzureTranslationClient: { fromEnvironment: state.azureClient } }));
vi.mock("@/lib/quota-aware-translation-client", () => ({ createQuotaAwareTranslationClient: state.createQuotaAwareTranslationClient }));

import { GET, POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("Azure Translator debug API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("AZURE_TRANSLATOR_API_KEY", "azure-secret-must-not-leak");
    vi.stubEnv("AZURE_TRANSLATOR_ENDPOINT", "https://api.cognitive.microsofttranslator.com");
    vi.stubEnv("AZURE_TRANSLATOR_REGION", "koreacentral");
    vi.stubEnv("AZURE_TRANSLATOR_FREE_TIER_CONFIRMED", "F0");
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "google-secret-must-not-leak");
    state.requireAdminSession.mockResolvedValue(true);
    state.isCronRequestAuthorized.mockReturnValue(false);
    state.getPool.mockReturnValue({ query: vi.fn(async (sql: string) => sql.includes("translation_usage_reservations")
      ? { rows: [{ used: "17" }] }
      : { rows: [{ reserved: "42", translated: "35", updatedAt: new Date("2026-10-24T00:00:00.000Z") }] }) });
    state.azureClient.mockReturnValue({ translate: vi.fn() });
    state.createQuotaAwareTranslationClient.mockReturnValue({
      client: { translate: vi.fn(async (text: string) => ({ translatedText: "스톡맨 번역 진단", provider: "azure-translator", source: "en", target: "ko", fallback: false, providerAttemptCount: 1 })) },
      getMetrics: () => ({ apiCalls: 1, apiFailures: 0, lastFailure: null }),
    });
  });

  it("requires administrator or cron authentication", async () => {
    state.requireAdminSession.mockResolvedValue(false);
    const response = await GET(new Request("https://example.test/api/admin/azure-translator-debug"));
    expect(response.status).toBe(401);
    expect(state.getPool).not.toHaveBeenCalled();
  });

  it("returns safe configuration and provider quota without credential values", async () => {
    const response = await GET(new Request("https://example.test/api/admin/azure-translator-debug"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      configuration: { providerEnabled: true, keyConfigured: true, endpointShape: { host: "api.cognitive.microsofttranslator.com", path: "/", queryPresent: false }, regionConfigured: true, f0Confirmed: true },
      liveTest: "not_run",
    });
    expect(body.quota).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "azure-translator", monthlyReservedCharacters: 42, rollingHourReservedCharacters: 17 })]));
    expect(JSON.stringify(body)).not.toContain("secret-must-not-leak");
  });

  it("runs one quota-protected live translation test and reports the result", async () => {
    const response = await POST(new Request("https://example.test/api/admin/azure-translator-debug", { method: "POST" }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, mode: "AZURE_TRANSLATOR_LIVE_TEST", result: { provider: "azure-translator", target: "ko", translated: true } });
    expect(state.createQuotaAwareTranslationClient).toHaveBeenCalledWith(expect.anything(), undefined, undefined, { deferCacheWriteUntilValidated: true }, expect.objectContaining({ provider: "azure-translator" }));
    expect(JSON.stringify(body)).not.toContain("secret-must-not-leak");
  });

  it("returns provider failure status, code, and request ID without leaking keys", async () => {
    const diagnostic = { provider: "azure-translator", category: "http", httpStatus: 401, providerCode: "401001", providerMessage: "Invalid key", requestId: "azure-request-1", retryAfter: null, attempts: 3 };
    state.createQuotaAwareTranslationClient.mockReturnValue({
      client: { translate: vi.fn(async () => { throw Object.assign(new Error("request failed"), { stage: "provider_request", provider: "azure-translator", providerAttempts: 3 }); }) },
      getMetrics: () => ({ apiCalls: 3, apiFailures: 3, lastFailure: diagnostic }),
    });
    const response = await POST(new Request("https://example.test/api/admin/azure-translator-debug", { method: "POST" }));
    const body = await response.json();
    expect(response.status).toBe(502);
    expect(body).toMatchObject({ ok: false, stage: "provider_request", providerFailure: diagnostic });
    expect(JSON.stringify(body)).not.toContain("secret-must-not-leak");
  });
});
