import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudTranslationClient } from "./cloud-translation-client";

afterEach(() => vi.unstubAllEnvs());

describe("CloudTranslationClient", () => {
  it("returns no client when service-account configuration is absent or invalid", () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "");
    expect(CloudTranslationClient.fromEnvironment()).toBeNull();
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", "not-json");
    expect(CloudTranslationClient.fromEnvironment()).toBeNull();
  });

  it("translates through the official REST shape", async () => {
    vi.stubEnv("GOOGLE_SERVICE_ACCOUNT_JSON", JSON.stringify({ project_id: "p", client_email: "svc@example.com", private_key: "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----" }));
    const client = CloudTranslationClient.fromEnvironment()!;
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ translations: [{ translatedText: "안녕하세요" }] }), { status: 200 })));
    // The JWT signer validates the key before fetch; use a valid generated key
    // for the transport contract test.
    const { privateKey } = await new Promise<{ privateKey: string }>((resolve, reject) => {
      import("node:crypto").then(({ generateKeyPair }) => generateKeyPair("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } }, (error, _publicKey, privateKey) => error ? reject(error) : resolve({ privateKey: privateKey as string }))).catch(reject);
    });
    const result = await new CloudTranslationClient({ project_id: "p", client_email: "svc@example.com", private_key: privateKey }).translate("Hello");
    expect(result).toMatchObject({ translatedText: "안녕하세요", source: "en", target: "ko", provider: "google-cloud-translation", fallback: false });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as any).mock.calls[1][1].body).toContain("Hello");
  });
});
