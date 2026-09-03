import { describe, expect, it, vi } from "vitest";

const { ensureSchema, loadPushSubscriptionDebug, savePushSubscription, updatePushSubscriptionPreferences } = vi.hoisted(() => ({
  ensureSchema: vi.fn(),
  loadPushSubscriptionDebug: vi.fn(),
  savePushSubscription: vi.fn(),
  updatePushSubscriptionPreferences: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ ensureSchema }));
vi.mock("@/lib/push", () => ({ loadPushSubscriptionDebug, savePushSubscription, updatePushSubscriptionPreferences }));

import { PATCH, POST } from "./route";

const valid = { endpoint: "https://push.example.test/subscription", keys: { p256dh: "key", auth: "auth" } };

describe("push subscription API", () => {
  it("rejects malformed JSON as client input", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "INVALID_PUSH_SUBSCRIPTION" });
  });

  it("returns service unavailable when subscription persistence fails", async () => {
    ensureSchema.mockResolvedValueOnce(undefined);
    savePushSubscription.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify(valid) }));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "PUSH_SUBSCRIPTION_FAILED" });
  });

  it("separates malformed PATCH input from persistence errors", async () => {
    const invalid = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({}) }));
    expect(invalid.status).toBe(400);
    ensureSchema.mockResolvedValueOnce(undefined);
    updatePushSubscriptionPreferences.mockRejectedValueOnce(new Error("database unavailable"));
    const failed = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ endpoint: valid.endpoint }) }));
    expect(failed.status).toBe(503);
  });
});
