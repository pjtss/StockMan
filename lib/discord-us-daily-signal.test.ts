import { describe, expect, it } from "vitest";
import { buildUsDailyIndicatorDiscordChunks } from "./discord-us-daily-signal";

describe("buildUsDailyIndicatorDiscordChunks", () => {
  it("splits long indicator alerts below Discord's content limit", () => {
    const sections = [
      `**MFI 과매도 후보**\n${Array.from({ length: 45 }, (_, index) => `**NAS T${index}** 종목 ${index} · mfi ${index}`).join("\n")}`,
      `**DMI 상승 후보**\n${Array.from({ length: 45 }, (_, index) => `**NYS D${index}** 종목 ${index} · plusDi ${index} · -DI 1 · ADX 20`).join("\n")}`,
    ];
    const chunks = buildUsDailyIndicatorDiscordChunks(sections);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 2_000)).toBe(true);
    expect(chunks.join("\n")).toContain("해외주식 일봉 지표 알림");
    expect(chunks.join("\n")).toContain("MFI 과매도 후보");
    expect(chunks.join("\n")).toContain("DMI 상승 후보");
  });
});
