import { describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.mock("@/lib/discord-config", () => ({
  loadFeatureDiscordWebhook: vi.fn().mockResolvedValue("https://discord.test/webhook"),
}));

describe("Korean Bollinger Discord text", () => {
  it("keeps consecutive candidates on adjacent lines", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 204, text: async () => "" });
    const { sendKrBollingerBandSignals } = await import("./discord-kr-bollinger-band");
    await sendKrBollingerBandSignals([
      { market: "KRX", code: "000001", name: "첫 종목", qualifies: true } as never,
      { market: "KRX", code: "000002", name: "둘째 종목", qualifies: true } as never,
    ]);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { content: string };
    expect(payload.content).toContain("KRX | 첫 종목\nKRX | 둘째 종목");
    expect(payload.content).not.toContain("첫 종목\n\nKRX | 둘째 종목");
  });
});
