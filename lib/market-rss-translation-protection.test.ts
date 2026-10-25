import { describe, expect, it } from "vitest";
import { protectMarketRssTranslationTokens, restoreMarketRssTranslationTokens } from "./market-rss-translation-protection";
import { extractMarketRssProtectedTokens } from "./market-rss-translation-tokens.mjs";

describe("market RSS translation token protection", () => {
  it("preserves numeric values, percentages, quarter numbers, and uppercase tickers", () => {
    const masked = protectMarketRssTranslationTokens("NVDA sees $2.5B revenue in Q3, up 18% from 2025.");
    expect(masked.text).not.toContain("$2.5B");
    expect(masked.text).not.toContain("18%");
    expect(masked.text).not.toContain("2025");
    expect(masked.text).not.toContain("NVDA");
    expect(masked.placeholders.map(({ original }) => original)).toContain("Q3");

    const restored = restoreMarketRssTranslationTokens(`엔비디아 ${masked.text}`, masked.placeholders);
    expect(restored).toEqual({ ok: true, text: "엔비디아 NVDA sees $2.5B revenue in Q3, up 18% from 2025." });
  });

  it.each(["2상", "1b상", "2/3상", "2b/3상"])("preserves the complete clinical stage %s as one positional token", (stage) => {
    const source = `Clinical results from ${stage} study`;
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toContain(stage);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
  });

  it("preserves class-share and single-letter dollar-prefixed tickers", () => {
    const masked = protectMarketRssTranslationTokens("BRK.B and BF-B outperform; $C is unchanged.");
    expect(masked.placeholders.map(({ original }) => original)).toContain("BRK.B");
    expect(masked.placeholders.map(({ original }) => original)).toContain("BF-B");
    expect(masked.placeholders.map(({ original }) => original)).toContain("$C");
    expect(restoreMarketRssTranslationTokens(`변동 없음 ${masked.text}`, masked.placeholders)).toMatchObject({ ok: true });
  });

  it.each(["6-K", "8-K/A", "10-Q", "20-F", "S-1", "F-1", "424B5"])("preserves SEC form identifier %s as one token", (form) => {
    const source = `Files a report on Form ${form} today.`;
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toContain(form);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
  });

  it.each(["VIKTORIA-1", "COMPANION-002", "COVID-19", "CD-19"])("preserves clinical and named identifiers %s as one token", (identifier) => {
    const source = `Results from ${identifier} study`;
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toContain(identifier);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
  });

  it("does not mistake a reverse split ratio for an SEC form identifier", () => {
    const masked = protectMarketRssTranslationTokens("Announces a 1-for-4 reverse stock split");

    expect(masked.placeholders.map(({ original }) => original)).not.toContain("1-for");
    expect(masked.placeholders.map(({ original }) => original)).toContain("1");
    expect(masked.placeholders.map(({ original }) => original)).toContain("-4");
  });

  it("keeps ASCII and Unicode signs attached to financial values", () => {
    const source = "Revenue changed −12%, then +8.5%, while profit fell -$2.4B and costs rose $-3.2M.";
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual(["−12%", "+8.5%", "-$2.4B", "$-3.2M"]);
    expect(masked.text).not.toContain("12%");
    expect(masked.text).not.toContain("8.5%");
    expect(masked.text).not.toContain("2.4B");
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
  });

  it("preserves valuation multiple x suffixes as part of financial number tokens", () => {
    const source = "EV/EBITDA re-rates from 12.5x to 10X.";
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual(["EV", "EBITDA", "12.5x", "10X"]);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
    expect(extractMarketRssProtectedTokens(source)).toEqual(masked.placeholders.map(({ original }) => original));
  });

  it("rejects missing or duplicated protected markers", () => {
    const masked = protectMarketRssTranslationTokens("Revenue rose 25%.");
    expect(restoreMarketRssTranslationTokens("매출이 증가했습니다.", masked.placeholders).ok).toBe(false);
    expect(restoreMarketRssTranslationTokens(`${masked.text} ${masked.text}`, masked.placeholders).ok).toBe(false);
    expect(restoreMarketRssTranslationTokens("번역 ZX9Q", []).ok).toBe(false);
  });

  it.each([
    "ZX0Q revenue rises 20%",
    "Revenue ZX12Q reaches $1.2B",
    "Growth 25% vs ZX99Q and NVDA",
  ])("restores marker-shaped source text without confusing it with generated placeholders: %s", (source) => {
    const masked = protectMarketRssTranslationTokens(source);
    const restored = restoreMarketRssTranslationTokens(masked.text, masked.placeholders);

    expect(restored).toEqual({ ok: true, text: source });
  });

  it("leaves normal uppercase English words available for translation", () => {
    const masked = protectMarketRssTranslationTokens("WHAT Is Next for NVDA?");
    expect(masked.text).toContain("WHAT");
    expect(masked.placeholders.map(({ original }) => original)).toContain("NVDA");
  });

  it("leaves common all-caps publisher headline words available for translation", () => {
    const masked = protectMarketRssTranslationTokens("DENARIUS METALS FILES TORAL PROJECT TECHNICAL REPORT ON SEDAR+");

    expect(masked.text).toContain("METALS FILES");
    expect(masked.text).toContain("PROJECT TECHNICAL REPORT ON");
    expect(masked.placeholders.map(({ original }) => original)).toContain("SEDAR");
  });

  it("still protects a ticker whose spelling is an ordinary English word", () => {
    const masked = protectMarketRssTranslationTokens("Top spot | ZIP Stock News");

    expect(masked.text).toContain("Top spot");
    expect(masked.placeholders.map(({ original }) => original)).toContain("ZIP");
  });

  it("exposes the same complete protected-token inventory to the review importer", () => {
    const title = "NVDA sees $2.5B revenue in Q3, up 18% from 2025 with 40 bps margin";
    expect(extractMarketRssProtectedTokens(title)).toEqual(
      protectMarketRssTranslationTokens(title).placeholders.map(({ original }) => original),
    );
  });

  it.each([
    ["8-10x", "8-10x"],
    ["8–10x", "8–10x"],
    ["20%-25%", "20%-25%"],
    ["-$2.4B–$3.1B", "-$2.4B–$3.1B"],
  ])("preserves the full financial range %s as one review token", (range, expectedToken) => {
    const source = `Revenue guidance was ${range}.`;
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual([expectedToken]);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
    expect(extractMarketRssProtectedTokens(source)).toEqual([expectedToken]);
  });

  it.each([
    ["($2.4B)", "($2.4B)"],
    ["(20%)", "(20%)"],
    ["(8-10x)", "(8-10x)"],
    ["20% (vs. 15%)", "20%", "15%"],
  ])("preserves financial parentheses in %s", (source, ...expectedTokens) => {
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual(expectedTokens);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
    expect(extractMarketRssProtectedTokens(source)).toEqual(expectedTokens);
  });

  it.each([
    ["$1,234.56", "$1,234.56"],
    ["€1.234,56", "€1.234,56"],
    ["1.234,56", "1.234,56"],
    ["1,5%", "1,5%"],
    ["12,34,567.89", "12,34,567.89"],
    ["1'234.50", "1'234.50"],
    ["1 234,56 €", "1 234,56 €"],
    ["1 234,56 €", "1 234,56 €"],
  ])("preserves locale-formatted financial number %s as one token", (source, expectedToken) => {
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual([expectedToken]);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
    expect(extractMarketRssProtectedTokens(source)).toEqual([expectedToken]);
  });

  it.each([
    ["5 million", "5 million"],
    ["$3.1 billion", "$3.1 billion"],
    ["£2bn", "£2bn"],
    ["€15.5m", "€15.5m"],
    ["5 million-7 million", "5 million-7 million"],
    ["3 markets", "3"],
  ])("keeps financial magnitude suffixes intact without swallowing following words: %s", (source, expectedToken) => {
    const masked = protectMarketRssTranslationTokens(source);

    expect(masked.placeholders.map(({ original }) => original)).toEqual([expectedToken]);
    expect(restoreMarketRssTranslationTokens(masked.text, masked.placeholders)).toEqual({ ok: true, text: source });
    expect(extractMarketRssProtectedTokens(source)).toEqual([expectedToken]);
  });
});
