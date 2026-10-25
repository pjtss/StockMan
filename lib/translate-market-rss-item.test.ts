import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudTranslationClient } from "./cloud-translation-client";
import { translateMarketRssItem, translateMarketRssItems } from "./translate-market-rss-item";
import type { MarketRssItem } from "./market-rss";
import type { TranslationClient } from "./translation-types";
import { extractMarketRssTranslatedHeadline, MARKET_RSS_TRANSLATION_CONTEXT_MARKER, MARKET_RSS_TRANSLATION_HEADLINE_MARKER, prepareMarketRssTranslationInput } from "./market-rss-translation-input";
import { createQuotaAwareTranslationClient } from "./quota-aware-translation-client";
import { parseMarketRss } from "./market-rss";

const item = (id: string): MarketRssItem => ({ id, title: `Title ${["one", "two", "three", "four", "five"][Number(id) - 1] || id}`, summary: `Long summary ${id}`, link: "https://example.com", publishedAt: null, source: "TEST" });
const client = (translate: TranslationClient["translate"]): TranslationClient => ({ translate });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("market RSS translation", () => {
  it("localizes only the standardized SEC filing title and leaves every other field unchanged", async () => {
    const source: MarketRssItem = {
      ...item("sec-filing"),
      source: "SEC_EDGAR",
      title: "8-K - Replimune Group, Inc. (0001737953) (Filer)",
      summary: "Original SEC summary text",
      content: "Original SEC filing body",
    };
    const translate = vi.fn();

    const result = await translateMarketRssItem(source, client(translate));

    expect(result.translatedTitle).toBe("8-K 공시 - Replimune Group, Inc. (0001737953) (제출자)");
    expect(result.title).toBe(source.title);
    expect(result.summary).toBe(source.summary);
    expect(result.content).toBe(source.content);
    expect(result.translatedSummary).toBe(source.summary);
    expect(result.translatedContent).toBe(source.content);
    expect(result.translationFallback).toBe(false);
    expect(result.translationProvider).toBe("sec-filing-title-localization");
    expect(translate).not.toHaveBeenCalled();
  });

  it("does not apply SEC title localization to the other RSS sources", async () => {
    const source: MarketRssItem = {
      ...item("stocktitan-sec-shaped-title"),
      source: "STOCKTITAN",
      title: "8-K - Replimune Group, Inc. (0001737953) (Filer)",
    };
    const translate = vi.fn(async () => ({
      translatedText: "8-K 공시 Replimune 제출자",
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(result.translationProvider).not.toBe("sec-filing-title-localization");
  });

  it("sends only the XML-decoded RSS headline to the provider and restores a readable translation", async () => {
    const feed = parseMarketRss('<rss><channel><item><guid>company-story</guid><title>AT&amp;T raises 20% outlook</title><link>https://example.com/story</link><description>AT&amp;T expects growth &amp; stronger revenue.</description></item></channel></rss>', "TEST", "https://example.com/feed");
    const source = feed.items[0];
    source.content = "Full article body: AT&amp;T business details.";
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}AT&amp;T 전망 ZX0Q 상향${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}AT&amp;T 매출 성장</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(source.title).toBe("AT&T raises 20% outlook");
    expect(source.summary).toBe("AT&T expects growth & stronger revenue.");
    expect(translate).toHaveBeenCalledWith("AT&T raises ZX0Q outlook", "auto", "ko", "text");
    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).not.toContain(source.summary);
    expect(translate.mock.calls[0][0]).not.toContain(source.content);
    expect(result).toMatchObject({ translatedTitle: "AT&T 전망 20% 상향", translationFallback: false });
    expect(result.summary).toBe(source.summary);
    expect(result.content).toBe(source.content);
    expect(result.translatedSummary).toBe(source.summary);
    expect(result.translatedContent).toBe(source.content);
  });

  it("retries an Azure title that fails Korean validation with the configured Google provider", async () => {
    const source = { ...item("quality-fallback"), title: "Nvidia Announces Strong Revenue Growth and Improved Outlook" };
    const primaryTranslate = vi.fn(async () => ({
      translatedText: "Nvidia update",
      source: "en" as const,
      target: "ko" as const,
      provider: "azure-translator",
      fallback: false,
      requestOrigin: "PROVIDER" as const,
    }));
    const fallbackTranslate = vi.fn(async () => ({
      translatedText: "엔비디아가 매출 성장세를 이어가며 전망도 개선",
      source: "en" as const,
      target: "ko" as const,
      provider: "google-cloud-translation",
      fallback: false,
      requestOrigin: "PROVIDER" as const,
    }));
    const provider: TranslationClient = { translate: primaryTranslate, translateFallbackProvider: fallbackTranslate };

    const result = await translateMarketRssItem(source, provider);

    expect(primaryTranslate).toHaveBeenCalledOnce();
    expect(fallbackTranslate).toHaveBeenCalledOnce();
    expect(fallbackTranslate.mock.calls[0][0]).toBe(prepareMarketRssTranslationInput(source.title).text);
    expect(result).toMatchObject({
      translatedTitle: "엔비디아가 매출 성장세를 이어가며 전망도 개선",
      translationFallback: false,
      translationProvider: "google-cloud-translation",
      translatedSummary: source.summary,
    });
  });

  it("preserves locale-formatted currency from RSS XML through provider translation and restoration", async () => {
    const feed = parseMarketRss('<rss><channel><item><guid>locale-currency</guid><title>Revenue reached 1&#x202F;234,56&#160;€</title></item></channel></rss>', "TEST", "https://example.com/feed");
    const source = feed.items[0];
    const translate = vi.fn(async (text: string) => ({
      translatedText: text.replace("Revenue reached", "매출이 증가했다"),
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(source.title).toBe("Revenue reached 1\u202f234,56\u00a0€");
    expect(translate).toHaveBeenCalledWith("Revenue reached ZX0Q", "auto", "ko", "text");
    expect(result.translatedTitle).toBe("매출이 증가했다 1\u202f234,56\u00a0€");
    expect(result.translationFallback).toBe(false);
  });

  it.each(["", "   ", "<p><br></p>", "--- 123 %"])("does not call the provider for unusable headline input: %j", async (title) => {
    const translate = vi.fn(async () => ({ translatedText: "번역 제목", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("empty-headline"), title };

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ translatedTitle: title, translationFallback: true, translationFallbackReason: "translation_input_empty" });
  });

  it("does not call the provider for a fully Korean headline", async () => {
    const translate = vi.fn(async () => ({ translatedText: "삼성전자", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("21"), title: "삼성전자, 3분기 영업이익 25% 증가" };
    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: false, translationNotRequired: true });
  });

  it("recognizes decomposed Hangul as Korean without a provider request", async () => {
    const translate = vi.fn(async () => ({ translatedText: "삼성전자 실적 증가", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("decomposed-korean"), title: "삼성전자 실적 증가" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).not.toHaveBeenCalled();
    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: false, translationNotRequired: true });
  });

  it("normalizes decomposed Hangul provider output before language validation and persistence", async () => {
    const source = { ...item("decomposed-provider-korean"), title: "Samsung reports higher revenue" };
    const decomposedHeadline = "삼성전자 매출 증가";
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}${decomposedHeadline}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}context</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result.translatedTitle).toBe("삼성전자 매출 증가");
    expect(result.translationFallback).toBe(false);
  });

  it("still translates a Korean headline containing English text", async () => {
    const translate = vi.fn(async () => ({ translatedText: "삼성전자, 엔비디아 AI 매출 증가", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("22"), title: "삼성전자, Nvidia AI 매출 증가" };
    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith(expect.any(String), "auto", "ko", "text");
    expect(result.translationNotRequired).toBeUndefined();
  });

  it.each(["삼성전자上涨", "삼성전자株価上昇", "삼성전자 рост"]) (
    "translates mixed Hangul and non-Latin-script headline %s",
    async (title) => {
      const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}삼성전자 주가 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}문맥 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
      const source = { ...item("mixed-script"), title };

      const result = await translateMarketRssItem(source, client(translate));

      expect(translate).toHaveBeenCalledOnce();
      expect(translate).toHaveBeenCalledWith(expect.any(String), "auto", "ko", "text");
      expect(result).toMatchObject({ translatedTitle: "삼성전자 주가 상승", translationFallback: false });
      expect(result.translationNotRequired).toBeUndefined();
    },
  );

  it("translates only the headline while preserving the original summary", async () => {
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}제목 번역 완료${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Long summary 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const result = await translateMarketRssItem(item("1"), client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate).toHaveBeenCalledWith("Title one", "auto", "ko", "text");
    expect(translate.mock.calls[0][0]).not.toContain("Long summary 1");
    expect(result.translatedTitle).toBe("제목 번역 완료");
    expect(result.translatedSummary).toBe("Long summary 1");
  });

  it("does not include summary content in the provider request", async () => {
    const source = { ...item("context"), title: "I've Held Nvidia for 3 Years", summary: "<p>I bought shares in the company and still own them.</p>" };
    const translate = vi.fn(async (text: string) => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 주식을 ${[...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ")}년 보유${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}회사 주식을 매수해 아직 보유 중</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledWith("I've Held Nvidia stock for ZX0Q Years", "auto", "ko", "text");
    expect(translate.mock.calls[0][0]).not.toContain(source.summary);
    expect(result.translatedTitle).toBe("엔비디아 주식을 3년 보유");
    expect(result.translatedSummary).toBe(source.summary);
    expect(result.translationFallback).toBe(false);
  });

  it("bounds summary context and strips markup and control characters", () => {
    const prepared = prepareMarketRssTranslationInput("Revenue rises", `<p>A\u0000B</p>${"x".repeat(600)}`);

    expect(prepared.text).toMatch(/^<div><p id="market-rss-headline">Revenue rises<\/p><p id="market-rss-context">A B x{1,499}<\/p><\/div>$/);
    expect(prepared.text).toContain('id="market-rss-headline"');
    expect(prepared.text).not.toContain("\u0000");
    expect(prepared.text.match(/x/g)).toHaveLength(497);
    expect(prepared.hasContext).toBe(true);
  });

  it("truncates summary context by Unicode code point without splitting a supplementary character", () => {
    const prepared = prepareMarketRssTranslationInput("Revenue rises", `${"x".repeat(499)}🚀tail`);
    const context = prepared.text.split(MARKET_RSS_TRANSLATION_CONTEXT_MARKER)[1]?.replace(/<\/p><\/div>$/, "") || "";

    expect(Array.from(context)).toHaveLength(500);
    expect(context.endsWith("🚀")).toBe(true);
    expect(context).not.toContain("tail");
    expect(context).not.toContain("\uFFFD");
  });

  it("removes lone surrogates from provider input while preserving valid supplementary characters", () => {
    const prepared = prepareMarketRssTranslationInput(`Revenue${String.fromCharCode(0xd800)} rises 🚀`, `Outlook${String.fromCharCode(0xdc00)} improves 😀`);

    expect(prepared.text).toContain("🚀");
    expect(prepared.text).toContain("😀");
    expect(Array.from(prepared.text).some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint >= 0xd800 && codePoint <= 0xdfff;
    })).toBe(false);
  });

  it("normalizes title control characters and line breaks only in provider input", () => {
    const title = "Revenue\u0000\n\t rises";
    const prepared = prepareMarketRssTranslationInput(title);

    expect(prepared.text).toBe("Revenue rises");
    expect(prepared.titleLength).toBe("Revenue rises".length);
  });

  it("sends visible title text only when RSS headlines contain markup or hidden elements", async () => {
    const source = {
      ...item("headline-markup"),
      title: "<b>Nvidia</b> revenue rises<!-- hidden note --><script>fake earnings</script><style>.bad{}</style><noscript>fallback text</noscript>",
      summary: "",
    };
    const translate = vi.fn(async (text: string) => ({ translatedText: "엔비디아 매출 증가", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledWith("Nvidia revenue rises", "auto", "ko", "text");
    expect(result.title).toBe(source.title);
    expect(result.translatedTitle).toBe("엔비디아 매출 증가");
    expect(result.translationFallback).toBe(false);
  });

  it.each([
    ["&lt;b&gt;Nvidia&lt;/b&gt; revenue rises", "Nvidia revenue rises"],
    ["&amp;lt;b&amp;gt;Nvidia&amp;lt;/b&amp;gt; revenue rises", "&lt;b&gt;Nvidia&lt;/b&gt; revenue rises"],
  ])("decodes XML once and does not reinterpret double-encoded literal markup: %s", async (xmlTitle, expectedProviderTitle) => {
    const feed = parseMarketRss(`<rss><channel><item><guid>entity-headline</guid><title>${xmlTitle}</title></item></channel></rss>`, "TEST", "https://example.com/feed");
    const source = feed.items[0];
    const translate = vi.fn(async () => ({ translatedText: "엔비디아 매출 상승", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledWith(expectedProviderTitle, "auto", "ko", "text");
    expect(result.title).toBe(source.title);
    expect(result.translationFallback).toBe(false);
  });

  it("preserves financial inequalities while stripping actual HTML tags", async () => {
    const source = {
      ...item("headline-inequalities"),
      title: "<b>Nvidia</b> shares < $100 and > $80",
      summary: "",
    };
    const translate = vi.fn(async () => ({ translatedText: "엔비디아 주가 < ZX0Q 및 > ZX1Q", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledWith("Nvidia shares < ZX0Q and > ZX1Q", "auto", "ko", "text");
    expect(result.title).toBe(source.title);
    expect(result.translatedTitle).toBe("엔비디아 주가 < $100 및 > $80");
    expect(result.translationFallback).toBe(false);
  });

  it("preserves comparison operators in the cleaned RSS summary context", () => {
    const prepared = prepareMarketRssTranslationInput("Nvidia shares", "Shares traded < $100 and > $80; <b>record</b> improved.");

    expect(prepared.text).toContain("Shares traded &lt; $100 and &gt; $80; record improved.");
  });

  it("preserves locale grouping spaces through provider-input normalization and token restoration", async () => {
    const source = { ...item("locale-grouping"), title: "Revenue reached 1\u202f234,56\u00a0€", summary: "" };
    const translate = vi.fn(async (text: string) => ({
      translatedText: text.replace("Revenue reached", "매출이 증가했다"),
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(translate.mock.calls[0][0]).toBe("Revenue reached ZX0Q");
    expect(result.translatedTitle).toBe("매출이 증가했다 1\u202f234,56\u00a0€");
    expect(result.translationFallback).toBe(false);
  });

  it("canonicalizes equivalent NFC and NFD titles and summaries to one provider input", () => {
    const decomposed = prepareMarketRssTranslationInput("Cafe\u0301 revenue rises", "The cafe\u0301 outlook improves.");
    const composed = prepareMarketRssTranslationInput("Café revenue rises", "The café outlook improves.");

    expect(decomposed.text).toBe(composed.text);
    expect(decomposed.titleLength).toBe(composed.titleLength);
    expect(decomposed.text).toContain("Café revenue rises");
  });

  it("excludes non-visible script, style, and comment text from translation context", () => {
    const prepared = prepareMarketRssTranslationInput(
      "Revenue rises",
      "<p>Operating outlook improves&nbsp; 20%</p><!-- hidden editorial note --><script>inject misleading headline</script><style>.bad { color:red }</style><noscript>tracking fallback</noscript>",
    );

    expect(prepared.text).toContain("Operating outlook improves 20%");
    expect(prepared.text).not.toMatch(/editorial note|misleading headline|color:red|tracking fallback/);
    expect(prepared.text).toContain('id="market-rss-context"');
  });

  it("decodes valid HTML5 named and numeric entities in RSS context before HTML escaping", () => {
    const prepared = prepareMarketRssTranslationInput("Shares rise", "Caf&eacute; &amp; Cr&egrave;me&nbsp;rose &mdash; the company&rsquo;s outlook improved&#x21;");

    expect(prepared.text).toContain("Café &amp; Crème rose — the company’s outlook improved!");
    expect(prepared.text).not.toContain("&amp;mdash;");
    expect(prepared.text).not.toContain("&amp;rsquo;");
  });

  it("decodes summary entities once, preserves unknown entities, and drops invalid numeric scalars", () => {
    const prepared = prepareMarketRssTranslationInput("Shares rise", "&amp;nbsp; &madeup; &#xD800; &#999999999;");

    expect(prepared.text).toContain("&amp;nbsp; &amp;madeup;");
    expect(prepared.text).not.toContain("&#xD800;");
    expect(prepared.text).not.toContain("&#999999999;");
  });

  it("decodes common named HTML entities in the translated headline", () => {
    const translatedHtml = '<p id="market-rss-headline">실적&nbsp;상승 &mdash; 회사&rsquo;의 전망 개선</p><p id="market-rss-context">문맥</p>';

    expect(extractMarketRssTranslatedHeadline(translatedHtml)).toBe("실적 상승 — 회사’의 전망 개선");
  });

  it("decodes other valid HTML5 named entities and only one encoding layer", () => {
    const translatedHtml = '<p id="market-rss-headline">Caf&eacute; &amp; Cr&egrave;me &amp;nbsp; &madeup;</p><p id="market-rss-context">context</p>';

    expect(extractMarketRssTranslatedHeadline(translatedHtml)).toBe("Café & Crème &nbsp; &madeup;");
  });

  it("still rejects untranslated headline even when the RSS context is Korean", async () => {
    const source = { ...item("context-untranslated"), title: "Nvidia revenue rises", summary: "엔비디아 실적 관련 기사" };
    const translate = vi.fn(async (text: string) => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}Nvidia revenue rises${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}엔비디아 실적 관련 기사</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "target_language_not_detected" });
  });

  it("falls back when a long headline is reduced to a tiny Korean fragment", async () => {
    const source = { ...item("incomplete-korean"), title: "Nvidia revenue growth outlook improves after quarterly earnings" };
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}매출 증가${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}문맥</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "translation_output_incomplete", translationCandidateTitle: "매출 증가" });
  });

  it.each(["2026", "25%", "$1.2M"])("rejects an unprotected numeric claim invented by the provider: %s", async (inventedValue) => {
    const source = { ...item(`invented-number-${inventedValue}`), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 ${inventedValue} 증가${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "translation_numeric_hallucination",
      translationCandidateTitle: expect.stringContaining(inventedValue),
    });
  });

  it("accepts Arabic digits that faithfully translate spelled-out title numbers", async () => {
    const source = { ...item("spelled-ordinal"), title: "Hawaiian Electric Industries to Announce Third Quarter 2026 Results November 6 | HE Stock News", summary: "Company outlook improves" };
    const translate = vi.fn(async (text: string) => {
      const markers = [...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker);
      return {
        translatedText: `하와이 전기 산업, 3분기 ${markers[0]} 실적 발표 11월 ${markers[1]} | HE 주식 뉴스`,
        source: "en" as const,
        target: "ko" as const,
        provider: "test",
        fallback: false,
      };
    });

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: "하와이 전기 산업, 3분기 2026 실적 발표 11월 6 | HE 주식 뉴스",
      translatedSummary: source.summary,
      translationFallback: false,
    });
  });

  it("rejects a financial sign invented beside a spelled-out source number", async () => {
    const source = { ...item("invented-ordinal-sign"), title: "Third Quarter Outlook Improves", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({ translatedText: "-3분기 전망 개선", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translatedSummary: source.summary,
      translationFallback: true,
      translationFallbackReason: "translation_numeric_hallucination",
    });
  });

  it.each([
    ["8-K - Pathfinder Bancorp (0001609065) (Filer)", "Pathfinder Bancorp", "패스파인더 뱅코프", "Filer", "파일러"],
    ["4 - Example Holdings (0001234567) (Issuer)", "Example Holdings", "예시 홀딩스", "Issuer", "발행자"],
  ])("accepts a filing-title dash that was already present beside a protected number: %s", async (title, company, translatedCompany, role, translatedRole) => {
    const source = { ...item("filing-title-dash"), title, summary: "" };
    const translate = vi.fn(async (text: string) => ({
      translatedText: text.replace(company, translatedCompany).replace(role, translatedRole),
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translationFallback: false, translatedSummary: "" });
    expect(result.translatedTitle).toContain(translatedCompany);
    expect(result.translatedTitle).toContain(translatedRole);
  });

  it("does not treat digits inside a numeric HTML entity as a fabricated claim", async () => {
    const source = { ...item("numeric-html-entity"), title: "Nvidia outlook improves", summary: "" };
    const translate = vi.fn(async () => ({
      translatedText: "엔비디아&#8217; 전망 개선",
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: "엔비디아&#8217; 전망 개선", translationFallback: false });
  });

  it.each(["+", "-", "−", "﹣", "－"])("rejects a financial sign added outside a protected numeric token: %s", async (sign) => {
    const source = { ...item(`invented-sign-${sign}`), title: "Nvidia revenue rises 12%", summary: "" };
    const translate = vi.fn(async (text: string) => {
      const marker = [...text.matchAll(/ZX\d+Q/g)][0][0];
      return {
        translatedText: `엔비디아 매출 ${sign}${marker} 증가`,
        source: "en" as const,
        target: "ko" as const,
        provider: "test",
        fallback: false,
      };
    });

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "translation_numeric_hallucination",
      translationCandidateTitle: expect.stringContaining(`${sign}12%`),
    });
  });

  it("falls back on tiny translations of long Japanese RSS headlines without spaces", async () => {
    const source = { ...item("unspaced-japanese"), title: "決算発表後に企業の売上高と年間利益見通しが大幅に改善しました" };
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}매출 증가${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}문맥</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "translation_output_incomplete", translationCandidateTitle: "매출 증가" });
  });

  it("accepts a valid plain-text title translation without requiring an HTML wrapper", async () => {
    const source = { ...item("malformed-html"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({ translatedText: "엔비디아 매출이 증가하고 전망이 개선됐다", source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: "엔비디아 매출이 증가하고 전망이 개선됐다", translationFallback: false });
  });

  it("does not cache malformed provider output and retries the provider on the next attempt", async () => {
    const source = { ...item("uncacheable-provider-output"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    let providerCalls = 0;
    const provider: TranslationClient = {
      translate: vi.fn(async (text) => {
        providerCalls++;
        if (providerCalls === 1) return { translatedText: "malformed response", source: "en", target: "ko", provider: "test", fallback: false };
        return { translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`, source: "en", target: "ko", provider: "test", fallback: false };
      }),
    };
    const dependencies = {
      loadCache: vi.fn(async () => null),
      deleteCache: vi.fn(async () => undefined),
      saveCache: vi.fn(async () => 0),
      reserve: vi.fn(async () => ({ allowed: true, used: 0, limitReached: false })),
      release: vi.fn(async () => undefined),
      recordTranslated: vi.fn(async () => undefined),
      getUsageMonth: vi.fn(() => "2026-09"),
    } as any;
    const tracked = createQuotaAwareTranslationClient(provider, undefined, dependencies, { deferCacheWriteUntilValidated: true });

    const first = await translateMarketRssItem(source, tracked.client);
    expect(first).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "target_language_not_detected" });
    expect(dependencies.saveCache).not.toHaveBeenCalled();

    const second = await translateMarketRssItem(source, tracked.client);
    expect(second).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
    expect(providerCalls).toBe(2);
    expect(dependencies.saveCache).toHaveBeenCalledOnce();
  });

  it("uses the same provider cache key when only the excluded summary changes", async () => {
    const source = { ...item("changed-context"), title: "Nvidia revenue rises", summary: "Company forecasts growth" };
    const provider: TranslationClient = {
      translate: vi.fn(async () => ({
        translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`,
        source: "en",
        target: "ko",
        provider: "test",
        fallback: false,
      })),
    };
    const dependencies = {
      loadCache: vi.fn(async () => null),
      deleteCache: vi.fn(async () => undefined),
      saveCache: vi.fn(async () => 0),
      reserve: vi.fn(async () => ({ allowed: true, used: 0, limitReached: false })),
      release: vi.fn(async () => undefined),
      recordTranslated: vi.fn(async () => undefined),
      getUsageMonth: vi.fn(() => "2026-09"),
    } as any;
    const tracked = createQuotaAwareTranslationClient(provider, undefined, dependencies, { deferCacheWriteUntilValidated: true });

    await translateMarketRssItem(source, tracked.client);
    await translateMarketRssItem({ ...source, summary: "Company lowers its forecast" }, tracked.client);

    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(dependencies.loadCache).toHaveBeenCalledTimes(2);
    expect(dependencies.loadCache.mock.calls[0][0]).toBe(dependencies.loadCache.mock.calls[1][0]);
    expect(dependencies.saveCache).toHaveBeenCalledTimes(2);
  });

  it("removes a stale malformed cache hit so a later attempt can call the provider", async () => {
    const source = { ...item("stale-cache-output"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    let staleCacheExists = true;
    const provider: TranslationClient = {
      translate: vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`, source: "en", target: "ko", provider: "test", fallback: false })),
    };
    const dependencies = {
      loadCache: vi.fn(async () => staleCacheExists ? { translatedText: "malformed cached response", provider: "google-cloud-translation", characterCount: 10 } : null),
      deleteCache: vi.fn(async () => { staleCacheExists = false; }),
      saveCache: vi.fn(async () => 0),
      reserve: vi.fn(async () => ({ allowed: true, used: 0, limitReached: false })),
      release: vi.fn(async () => undefined),
      recordTranslated: vi.fn(async () => undefined),
      getUsageMonth: vi.fn(() => "2026-09"),
    } as any;
    const tracked = createQuotaAwareTranslationClient(provider, undefined, dependencies, { deferCacheWriteUntilValidated: true });

    const first = await translateMarketRssItem(source, tracked.client);
    expect(first).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
    expect(first).toMatchObject({ requestOrigin: "PROVIDER", translationProviderAttempts: 1 });
    expect(dependencies.deleteCache).toHaveBeenCalledWith("Nvidia revenue rises", "google-cloud-translation", "ko");

    const second = await translateMarketRssItem(source, tracked.client);
    expect(second).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
    expect(provider.translate).toHaveBeenCalledTimes(2);
    expect(dependencies.saveCache).toHaveBeenCalledTimes(2);
  });

  it("surfaces failed invalidation of a stale malformed cache and retries cleanly after storage recovers", async () => {
    const source = { ...item("stale-cache-delete-failure"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    let staleCacheExists = true;
    let storageAvailable = false;
    const provider: TranslationClient = {
      translate: vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`, source: "en", target: "ko", provider: "test", fallback: false })),
    };
    const dependencies = {
      loadCache: vi.fn(async () => staleCacheExists ? { translatedText: "malformed cached response", provider: "google-cloud-translation", characterCount: 10 } : null),
      deleteCache: vi.fn(async () => {
        if (!storageAvailable) throw new Error("database unavailable");
        staleCacheExists = false;
      }),
      saveCache: vi.fn(async () => 0),
      reserve: vi.fn(async () => ({ allowed: true, used: 0, limitReached: false })),
      release: vi.fn(async () => undefined),
      recordTranslated: vi.fn(async () => undefined),
      getUsageMonth: vi.fn(() => "2026-09"),
    } as any;
    const tracked = createQuotaAwareTranslationClient(provider, undefined, dependencies, { deferCacheWriteUntilValidated: true });

    const first = await translateMarketRssItem(source, tracked.client);
    expect(first).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "translation_cache_invalidation_failed" });
    expect(tracked.getMetrics().cacheInvalidationFailures).toBe(1);

    storageAvailable = true;
    const second = await translateMarketRssItem(source, tracked.client);
    expect(second).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
    expect(provider.translate).toHaveBeenCalledOnce();
    expect(dependencies.deleteCache).toHaveBeenCalledTimes(2);
  });

  it("bounds cache recovery to one provider retry when the fresh provider response is also malformed", async () => {
    const source = { ...item("cache-recovery-provider-still-malformed"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    let staleCacheExists = true;
    const provider: TranslationClient = {
      translate: vi.fn(async () => ({ translatedText: "still malformed", source: "en", target: "ko", provider: "test", fallback: false })),
    };
    const dependencies = {
      loadCache: vi.fn(async () => staleCacheExists ? { translatedText: "malformed cache", provider: "google-cloud-translation", characterCount: 10 } : null),
      deleteCache: vi.fn(async () => { staleCacheExists = false; }),
      saveCache: vi.fn(async () => 0),
      reserve: vi.fn(async () => ({ allowed: true, used: 0, limitReached: false })),
      release: vi.fn(async () => undefined),
      recordTranslated: vi.fn(async () => undefined),
      getUsageMonth: vi.fn(() => "2026-09"),
    } as any;
    const tracked = createQuotaAwareTranslationClient(provider, undefined, dependencies, { deferCacheWriteUntilValidated: true });

    const result = await translateMarketRssItem(source, tracked.client);

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "target_language_not_detected",
      requestOrigin: "PROVIDER",
      translationProviderAttempts: 1,
    });
    expect(provider.translate).toHaveBeenCalledOnce();
    expect(dependencies.saveCache).not.toHaveBeenCalled();
  });

  it("does not recursively retry a bad cache result when the client cannot invalidate cache", async () => {
    const source = { ...item("cache-without-invalidator"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const client: TranslationClient = {
      translate: vi.fn(async () => ({ translatedText: "malformed cached response", source: "en", target: "ko", provider: "test", fallback: false, requestOrigin: "CACHE" })),
    };

    const result = await translateMarketRssItem(source, client);

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "translation_cache_invalidation_failed",
    });
    expect(client.translate).toHaveBeenCalledOnce();
  });

  it.each(["&#999999999;", "&#xD800;"])("classifies invalid numeric HTML entity %s as malformed provider structure without throwing", async (invalidEntity) => {
    const source = { ...item("invalid-entity"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 상승 ${invalidEntity}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "translation_response_unparseable",
    });
  });

  it("identifies the headline by its preserved HTML id even if paragraph order changes", async () => {
    const source = { ...item("reordered-html"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async (text: string) => ({
      translatedText: `<div><p id="market-rss-context">기업 전망 개선</p><p id="market-rss-headline">엔비디아 매출 상승</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
  });

  it("removes hidden markup and comments from translated headline text", async () => {
    const source = { ...item("hidden-translation-markup"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 <script>숨겨진 주가 조작 문구</script><style>숨김 스타일 문구</style><!-- 숨긴 주석 -->매출 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: "엔비디아 매출 상승", translationFallback: false });
  });

  it("falls back when hidden markup is the only text in the translated headline", async () => {
    const source = { ...item("hidden-only-translation"), title: "Nvidia revenue rises", summary: "Company outlook improves" };
    const translate = vi.fn(async () => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}<script>엔비디아 매출 상승</script>${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}기업 전망 개선</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "translation_response_unparseable",
    });
  });

  it("protects figures and ticker symbols in the translation request and restores them", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 성장 ${[...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ")}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}요약 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("6"), title: "NVDA sees $2.5B revenue and 18% growth in Q3" };
    const result = await translateMarketRssItem(source, client(translate));

    expect(translate).toHaveBeenCalledTimes(1);
    expect(translate.mock.calls[0][0]).not.toContain("2.5");
    expect(translate.mock.calls[0][0]).not.toContain("18");
    expect(translate.mock.calls[0][0]).not.toContain("NVDA");
    expect(result.translatedTitle).toContain("엔비디아 매출 성장");
    for (const token of ["NVDA", "$2.5B", "18%", "Q3"]) expect(result.translatedTitle.split(token).length - 1).toBe(1);
    expect(result.translationFallback).toBe(false);
  });

  it("keeps signed financial values intact through provider input masking and result restoration", async () => {
    const source = { ...item("signed-values"), title: "Revenue falls −12% while costs rise +8.5% for NVDA" };
    const translate = vi.fn(async (text: string) => {
      const markers = [...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker);
      return { translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}매출 ${markers[0]} 감소, 비용 ${markers[1]} 상승 ${markers[2]}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}summary</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });

    const result = await translateMarketRssItem(source, client(translate));
    const requestedText = translate.mock.calls[0][0];

    expect(requestedText).not.toContain("−12%");
    expect(requestedText).not.toContain("+8.5%");
    expect(requestedText).not.toContain("NVDA");
    expect(result.translatedTitle).toBe("매출 −12% 감소, 비용 +8.5% 상승 NVDA");
    expect(result.translationFallback).toBe(false);
  });

  it("translates the complete headline without using the summary as extra context", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 주식을 거의 ${[...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ")}년 보유했다. 지금도 매수할까?${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Investor owns shares</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("8"), title: "I've Held Nvidia for Nearly 3 Years. Here's Whether I'd Still Buy Today." };
    const result = await translateMarketRssItem(source, client(translate));
    expect(translate.mock.calls[0][0]).toContain("I've Held Nvidia stock for Nearly ZX0Q Years.");
    expect(translate.mock.calls[0][0]).not.toContain(source.summary);
    expect(translate.mock.calls[0][0].length).toBe(prepareMarketRssTranslationInput(source.title).text.length);
    expect(result.title).toBe(source.title);
    expect(result.translatedTitle).toBe("엔비디아 주식을 거의 3년 보유했다. 지금도 매수할까?");
  });

  it("translates the full commodity headline without sending the summary", async () => {
    const translate = vi.fn(async (text: string) => ({
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}위험회피 심리로 옥수수 가격에 매도 압력 ${[...text.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ")}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Commodity market summary</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
    }));
    const source = { ...item("risk-off-corn"), title: "Corn Face Risk Off Pressure on Wednesday's Correction" };
    const result = await translateMarketRssItem(source, client(translate));

    expect(translate.mock.calls[0][0]).toContain("Corn prices face selling pressure from risk-off sentiment on Wednesday's Correction");
    expect(translate.mock.calls[0][0]).not.toContain(source.summary);
    expect(result.title).toBe(source.title);
    expect(result.translatedTitle).toContain("위험회피 심리로 옥수수 가격에 매도 압력");
    expect(result.translationFallback).toBe(false);
  });

  it("sends the exact shared prepared input through the Google REST client and restores returned tokens", async () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "test-translation-key");
    let requestedText = "";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestedText = JSON.parse(String(init?.body)).q;
      const placeholders = [...requestedText.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ");
      return new Response(JSON.stringify({ data: { translations: [{ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}옥수수 가격 하락 ${placeholders}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Long summary 번역</p></div>` }] } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const source = { ...item("9"), title: "Corn Pulling Back on Wednesday: 18% Decline" };
    const result = await translateMarketRssItem(source, new CloudTranslationClient("test-translation-key"));

    expect(requestedText).toBe(prepareMarketRssTranslationInput(source.title).text);
    expect(result.translatedTitle).toContain("옥수수 가격 하락");
    expect(result.translatedTitle).toContain("18");
    expect(result.translationFallback).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a clearly marked original-title fallback when the Google key is absent", async () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "");
    const source = { ...item("10"), title: "Corn Pulling Back on Wednesday: 18% Decline" };
    const result = await translateMarketRssItem(source);
    expect(result.translatedTitle).toBe(source.title);
    expect(result.translationFallback).toBe(true);
    expect(result.translationFallbackReason).toBe("cloud_translation_not_configured");
  });

  it("recognizes an already-Korean headline even when the Google key is absent", async () => {
    vi.stubEnv("GOOGLE_TRANSLATION_API_KEY", "");
    const source = { ...item("23"), title: "삼성전자, 영업이익 25% 증가" };
    const result = await translateMarketRssItem(source);

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: false, translationNotRequired: true });
  });

  it("falls back to the source title if the provider corrupts a protected marker", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: text.replace(/ZX\d+Q/g, ""), source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("7"), title: "Revenue up 25%" };
    const result = await translateMarketRssItem(source, client(translate));
    expect(result.translatedTitle).toBe(source.title);
    expect(result.translationFallback).toBe(true);
    expect(result.translationFallbackReason).toBe("protected_token_mismatch");
  });

  it("rejects a provider response with no Korean when the source contains translatable letters", async () => {
    const translate = vi.fn(async (text: string) => ({ translatedText: text, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("24"), title: "Global Markets Focus on Nvidia" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "target_language_not_detected" });
  });

  it("rejects a one-character Korean fragment as an untranslated headline", async () => {
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}상${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}요약은 한국어입니다</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("26"), title: "Nvidia rises" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "target_language_not_detected" });
  });

  it("rejects a mostly-English provider response even when it includes Korean words", async () => {
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}Nvidia revenue rises sharply 상승${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}요약 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("28"), title: "Nvidia revenue rises sharply" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "target_language_not_detected", translationCandidateTitle: "Nvidia revenue rises sharply 상승" });
  });

  it("falls back and retries a very short Korean fragment for a multi-word headline", async () => {
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}매출 증가${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}요약 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("incomplete-translation"), title: "Nvidia revenue rises sharply after earnings" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: source.title, translationFallback: true, translationFallbackReason: "translation_output_incomplete", translationCandidateTitle: "매출 증가" });
  });

  it("preserves an explicit monthly-quota fallback instead of relabeling it as a missing Korean result", async () => {
    const translate = vi.fn(async (text: string) => ({
      translatedText: text,
      source: "en" as const,
      target: "ko" as const,
      provider: "google-cloud-translation",
      fallback: true,
      fallbackReason: "monthly_character_limit_reached",
    }));
    const source = { ...item("27"), title: "Nvidia revenue rises 25%" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({
      translatedTitle: source.title,
      translationFallback: true,
      translationFallbackReason: "monthly_character_limit_reached",
    });
  });

  it("accepts Korean output while preserving protected source tokens", async () => {
    const translate = vi.fn(async () => ({ translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}엔비디아 매출 ZX0Q${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}요약</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false }));
    const source = { ...item("25"), title: "Nvidia revenue up 20%" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result).toMatchObject({ translatedTitle: "엔비디아 매출 20%", translationFallback: false });
  });

  it("does not count protected ticker placeholders against the Korean-language ratio", async () => {
    const translate = vi.fn(async (text: string) => {
      const headline = text.split(MARKET_RSS_TRANSLATION_CONTEXT_MARKER)[0];
      return {
      translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}실적 증가 ${[...headline.matchAll(/ZX\d+Q/g)].map(([marker]) => marker).join(" ")}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}시장 요약</p></div>`,
      source: "en" as const,
      target: "ko" as const,
      provider: "test",
      fallback: false,
      };
    });
    const source = { ...item("29"), title: "NVDA GOOGL META AMZN revenue rises 25%" };

    const result = await translateMarketRssItem(source, client(translate));

    expect(result.translationFallback).toBe(false);
    expect(result.translatedTitle).toContain("실적 증가");
    for (const ticker of ["NVDA", "GOOGL", "META", "AMZN"]) expect(result.translatedTitle.split(ticker).length - 1).toBe(1);
  });

  it("processes a batch with bounded concurrency and preserves input order", async () => {
    const order: string[] = [];
    const translate = vi.fn(async (text: string) => {
      const headline = text.match(/<p id="market-rss-headline">([\s\S]*?)<\/p>/)?.[1] || text;
      order.push(`start:${headline}`);
      await new Promise((resolve) => setTimeout(resolve, 1));
      order.push(`end:${headline}`);
      return { translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}제목 번역 완료${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Long summary 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });
    await translateMarketRssItems([item("1"), item("2"), item("3"), item("4"), item("5")], client(translate));

    expect(order.slice(0, 3)).toEqual(["start:Title one", "start:Title two", "start:Title three"]);
    expect(order).toContain("start:Title four");
    expect(order).toContain("start:Title five");
    expect(translate).toHaveBeenCalledTimes(5);
  });

  it("keeps other preview items when one provider request fails", async () => {
    const translate = vi.fn(async (text: string) => {
      if (text.includes("Title one")) throw new Error("provider unavailable");
      return { translatedText: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}제목 번역 완료${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}Long summary 번역</p></div>`, source: "en" as const, target: "ko" as const, provider: "test", fallback: false };
    });
    const onItemError = vi.fn();

    const results = await translateMarketRssItems([item("1"), item("2")], client(translate), onItemError);

    expect(results[0]).toMatchObject({ translatedTitle: "Title one", translationFallback: true, translationFallbackReason: "translation_api_error" });
    expect(results[1]).toMatchObject({ translatedTitle: "제목 번역 완료", translationFallback: false });
    expect(onItemError).toHaveBeenCalledWith(item("1"), expect.any(Error));
  });
});
