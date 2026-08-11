import { describe, expect, it } from "vitest";
import { buildUsVwapDiscordPayload } from "@/lib/discord-us-vwap";

describe("US VWAP Discord payload", () => {
  it("uses VWAP-specific fields instead of turnover-only fields", () => {
    const payload = buildUsVwapDiscordPayload([{
      market: "NAS", code: "TEST", name: "Test", currentPrice: 12.3456, vwap: 10.1234,
      aboveVwapPercent: 21.95, totalVolume: 123456, totalTradeValue: 9876543,
      marketCap: 100000000, turnoverRatio: 9.87, changeRate: 4.2,
      pointCount: 120, complete: true, sessionDate: "20260811",
    }]);
    const embed = payload.embeds[0];
    expect(payload.username).toBe("STOCKMAN US VWAP");
    expect(embed.title).toContain("NAS TEST");
    expect(embed.fields.map((field) => field.name)).toEqual(expect.arrayContaining(["당일 VWAP", "VWAP 상회율", "데이터"]));
    expect(embed.fields.map((field) => field.name)).not.toEqual(expect.arrayContaining(["후보 점수", "거래대금 RVOL", "시가 대비 고점"]));
    expect(embed.fields.find((field) => field.name === "시가총액")?.value).toContain("억");
  });

  it("renders missing metadata as a dash instead of zero", () => {
    const payload = buildUsVwapDiscordPayload([{
      market: "AMS", code: "TEST", currentPrice: 1, vwap: 1, aboveVwapPercent: 0,
      totalVolume: 1, totalTradeValue: 1, marketCap: null, turnoverRatio: null,
      changeRate: null, pointCount: 1, complete: false, sessionDate: "20260811",
    }]);
    const fields = payload.embeds[0].fields;
    expect(fields.find((field) => field.name === "시가총액")?.value).toBe("-");
    expect(fields.find((field) => field.name === "등락률")?.value).toBe("-");
    expect(fields.find((field) => field.name === "데이터")?.value).toContain("미완료");
  });
});
