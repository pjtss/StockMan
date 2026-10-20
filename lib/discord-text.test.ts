import { describe, expect, it } from "vitest";
import { toTextWebhookPayload } from "./discord-text";

describe("toTextWebhookPayload", () => {
  it("keeps Discord content within the 2,000-character limit", () => {
    const content = "🚀".repeat(2_100);
    const payload = toTextWebhookPayload({ content, allowed_mentions: { parse: [] } });

    expect(Array.from(payload.content as string)).toHaveLength(2_000);
    expect(payload.content.endsWith("…")).toBe(true);
    expect(payload.content).not.toContain("�");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.embeds).toBeUndefined();
  });

  it("preserves short content and flattens embed text", () => {
    expect(toTextWebhookPayload({ content: " 제목 ", embeds: [{ title: "추가" }] }).content).toBe("제목\n\n추가");
  });
});
