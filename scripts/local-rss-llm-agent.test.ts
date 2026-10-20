import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDiscordContent, parseAnalysisJson, validateAnalyses } from "./local-rss-llm-agent.mjs";

describe("local Codex RSS agent boundaries", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sanitizes mentions and limits Discord payload size", () => {
    const content = buildDiscordContent({ ticker: "NVDA", companyName: "@everyone", translatedTitleKo: "호재", analysisKo: "a".repeat(3000), article: { link: "https://user:pass@example.com/a?api_key=secret" } });
    expect(content).not.toContain("@everyone");
    expect(content).toContain("@\u200beveryone");
    expect(content).not.toContain("user:pass");
    expect(content).not.toContain("api_key=secret");
    expect(content).toContain("api_key=%5Bredacted%5D");
    expect(content.length).toBeLessThanOrEqual(1950);
  });

  it("normalizes only clear ticker symbols and rejects malformed analysis contracts", () => {
    const input = { analyses: [{ source: "STOCKTITAN", externalId: "x", revisionHash: "a".repeat(32), decision: "POSITIVE", ticker: "nvda", confidence: "HIGH", eventType: "계약", translatedTitleKo: "제목", analysisKo: "근거 분석", evidenceQuotes: [], risksKo: "위험", priority: 90 }] };
    expect(validateAnalyses(input).analyses[0].ticker).toBe("NVDA");
    expect(() => validateAnalyses({ analyses: [{ ...input.analyses[0], revisionHash: "bad" }] })).toThrow();
    expect(() => validateAnalyses({ analyses: Array.from({ length: 21 }, () => input.analyses[0]) })).toThrow();
    expect(parseAnalysisJson(JSON.stringify(input)).analyses[0].ticker).toBe("NVDA");
    expect(() => parseAnalysisJson(" ".repeat(1_000_001))).toThrow(/1MB/);
  });
});
