import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/telegram", () => ({ addTelegramSubscriber: vi.fn(), removeTelegramSubscriber: vi.fn(), sendTelegramMessage: vi.fn() }));
vi.mock("@/lib/db", () => ({ getPool: vi.fn(), ensureSchema: vi.fn() }));
import { POST } from "./route";

describe("Telegram webhook", () => {
  it("rejects an invalid configured secret before parsing", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected");
    const response = await POST(new Request("http://localhost", { method: "POST", body: "not-json" }));
    expect(response.status).toBe(401);
    vi.unstubAllEnvs();
  });

  it("returns a structured error for malformed JSON", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "expected");
    const response = await POST(new Request("http://localhost", { method: "POST", headers: { "x-telegram-bot-api-secret-token": "expected" }, body: "not-json" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "INVALID_JSON" });
    vi.unstubAllEnvs();
  });
});
