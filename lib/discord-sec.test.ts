import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSecDiscordWebhookPayload, sendSecResultToDiscord, type SecDiscordResult } from "./discord-sec";

const result: SecDiscordResult = {
  request: {
    url: "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
    originalUrl:
      "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm?utm_source=chatgpt.com",
  },
  urlInfo: {
    canonicalUrl: "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm",
    accessionNumber: "0001193125-26-295589",
    documentFile: "d84378d8k.htm",
  },
  document: {
    metadata: {
      documentType: "8-K",
      registrantName: "Broadcom Inc.",
      tradingSymbol: "AVGO",
      reportDate: "July 6, 2026",
    },
    events: [
      {
        type: "OTHER_EVENT",
        item: "8.01",
        title: "Other Events",
        text: "Broadcom and Apple agreed to expand their long-standing technology collaboration through 2031.",
      },
    ],
  },
  aiEvaluation: {
    model: "test-model",
    evaluation: {
      level: "bullish",
      fundamentalScore: 70,
      catalystScore: 65,
      shortTermImpactScore: 45,
      longTermImpactScore: 75,
      confidence: 80,
      noveltyScore: 60,
      surpriseScore: null,
      alreadyPricedInRisk: null,
      materialityScore: null,
      summary: "장기적으로 긍정적이나 단기 급등 판단에는 시장 데이터가 필요하다.",
      facts: ["브로드컴과 애플의 기술 협력이 2031년까지 확대됐다."],
      inferences: ["장기 매출 가시성 개선에 기여할 가능성이 있다."],
      unknowns: ["계약 금액이 공개되지 않았다."],
      eventRisks: [],
      analysisLimitations: ["시장 기대치 데이터가 없어 surpriseScore를 계산할 수 없다."],
      marketImpact: "장기적으로는 긍정적인 공시다.",
      requiresMarketData: true,
      recommendedNextChecks: ["공시 직후 거래량 변화 확인"],
      timeHorizon: {
        immediate: "insufficient_data",
        shortTerm: "positive",
        longTerm: "strong_positive",
      },
    },
  },
};

describe("discord-sec", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("builds a Discord webhook payload from a SEC result", () => {
    const payload = buildSecDiscordWebhookPayload(result);

    expect(payload.username).toBe("STOCKMAN SEC");
    expect(payload.allowed_mentions).toEqual({ parse: [] });
    expect(payload.content).toContain("Broadcom Inc.");
    expect(payload.embeds).toHaveLength(1);
    expect(payload.embeds[0].title).toContain("AVGO");
    expect(payload.embeds[0].url).toBe(result.urlInfo?.canonicalUrl);
    expect(payload.embeds[0].fields.some((field) => field.name === "Facts")).toBe(true);
    expect(payload.embeds[0].fields.some((field) => field.name === "Next Checks")).toBe(true);
  });

  it("sends the Discord webhook with wait=true", async () => {
    process.env = {
      ...originalEnv,
      SEC_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/1/token",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const sent = await sendSecResultToDiscord(result);
    const url = new URL(fetchMock.mock.calls[0][0]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);

    expect(sent.ok).toBe(true);
    expect(url.searchParams.get("wait")).toBe("true");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(body.content).toContain("Broadcom Inc.");
    expect(body.embeds).toBeUndefined();
  });
});
