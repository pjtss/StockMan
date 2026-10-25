import { describe, expect, it } from "vitest";
import { isMarketRssTranslationHeadlineComplete, isMarketRssTranslationKoreanEnough } from "./market-rss-translation-quality";

describe("isMarketRssTranslationKoreanEnough", () => {
  it("accepts Korean translations with retained tickers or brand names", () => {
    expect(isMarketRssTranslationKoreanEnough("엔비디아 매출 20% 증가" )).toBe(true);
    expect(isMarketRssTranslationKoreanEnough("NVDA 주가 급등" )).toBe(true);
    expect(isMarketRssTranslationKoreanEnough("Nvidia 매출 증가" )).toBe(true);
    expect(isMarketRssTranslationKoreanEnough("실적 증가 ZX0Q ZX1Q ZX2Q ZX3Q ZX4Q" )).toBe(true);
  });

  it("accepts a mostly Korean title that retains several long issuer and partner names", () => {
    expect(isMarketRssTranslationKoreanEnough("HeartCore, HeartCore Luvina Vietnam의 ZX0Q 지분 전략적 이전을 Luvina Software | ZX1Q 주식 뉴스")).toBe(true);
  });

  it("rejects unchanged English and mostly untranslated output with a small Korean fragment", () => {
    expect(isMarketRssTranslationKoreanEnough("Global Markets Focus on Nvidia")).toBe(false);
    expect(isMarketRssTranslationKoreanEnough("Nvidia revenue rises sharply 상승")).toBe(false);
    expect(isMarketRssTranslationKoreanEnough("상")).toBe(false);
  });
});

describe("isMarketRssTranslationHeadlineComplete", () => {
  it("rejects a very short Korean fragment for a multi-word source headline", () => {
    expect(isMarketRssTranslationHeadlineComplete("Nvidia revenue rises sharply after earnings", "매출 증가")).toBe(false);
  });

  it("does not mistake two Korean eojeol for a complete long headline", () => {
    expect(isMarketRssTranslationHeadlineComplete("Nvidia revenue growth outlook improves after quarterly earnings", "매출 증가")).toBe(false);
  });

  it("detects a tiny Korean fragment for a long source headline without whitespace", () => {
    expect(isMarketRssTranslationHeadlineComplete("決算発表後に企業の売上高と年間利益見通しが大幅に改善しました", "매출 증가")).toBe(false);
    expect(isMarketRssTranslationHeadlineComplete("決算発表後に企業の売上高と年間利益見通しが大幅に改善しました", "분기 실적 발표 후 연간 이익 전망 대폭 개선")).toBe(true);
  });

  it("accepts a reasonably complete translation with retained company names", () => {
    expect(isMarketRssTranslationHeadlineComplete("Nvidia revenue rises sharply after earnings", "엔비디아 매출 실적 발표 후 급등")).toBe(true);
  });

  it("rejects tiny output for short headlines when it omits source content", () => {
    expect(isMarketRssTranslationHeadlineComplete("Nvidia rises", "급등")).toBe(false);
    expect(isMarketRssTranslationHeadlineComplete("Nvidia rises", "엔비디아 주가 급등")).toBe(true);
    expect(isMarketRssTranslationHeadlineComplete("Tesla", "테슬라")).toBe(true);
    expect(isMarketRssTranslationHeadlineComplete("AI", "AI")).toBe(true);
  });

  it("ignores protected ticker and numeric placeholders in the source word count", () => {
    expect(isMarketRssTranslationHeadlineComplete("NVDA ZX0Q ZX1Q revenue rises", "매출과 주가 급등")).toBe(true);
  });

  it("accepts concise Korean wording when it preserves substantial headline content", () => {
    expect(isMarketRssTranslationHeadlineComplete("Nvidia revenue growth outlook improves after quarterly earnings", "엔비디아 분기 실적 발표 후 매출 성장 전망 개선")).toBe(true);
  });
});
