import { describe, expect, it } from "vitest";
import { normalizeMarketRssHeadlineContext, normalizeTranslatedMarketRssClinicalPhase } from "./market-rss-headline-context";

describe("market RSS headline context normalization", () => {
  it("clarifies that holding a public company means holding its stock", () => {
    expect(normalizeMarketRssHeadlineContext("I've Held Nvidia for Nearly 3 Years. Here's Whether I'd Still Buy Today."))
      .toBe("I've Held Nvidia stock for Nearly 3 Years. Here's Whether I'd Still Buy Today.");
  });

  it("does not inject stock ownership context into unrelated literal product-holding phrases", () => {
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia hardware in my hand for years."))
      .toBe("I've held Nvidia hardware in my hand for years.");
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia Shield for Nearly 3 Years."))
      .toBe("I've held Nvidia Shield for Nearly 3 Years.");
    expect(normalizeMarketRssHeadlineContext("I've held Nvidia GPUs for 3 years."))
      .toBe("I've held Nvidia GPUs for 3 years.");
  });

  it("clarifies commodity-price pullbacks without changing unrelated headlines", () => {
    expect(normalizeMarketRssHeadlineContext("Corn Pulling Back on Wednesday"))
      .toBe("Corn prices pulling back on Wednesday");
    expect(normalizeMarketRssHeadlineContext("Nvidia Pulling Back on Wednesday"))
      .toBe("Nvidia Pulling Back on Wednesday");
  });

  it("makes a known risk-off commodity headline grammatical and market-specific", () => {
    expect(normalizeMarketRssHeadlineContext("Corn Face Risk Off Pressure on Wednesday's Correction"))
      .toBe("Corn prices face selling pressure from risk-off sentiment on Wednesday's Correction");
  });

  it.each([
    ["BioNTech reports global Phase 2 data for pumitamig in advanced NSCLC", "BioNTech reports global 2상 data for pumitamig in advanced NSCLC"],
    ["AbCellera announces Phase 1b clinical trial results", "AbCellera announces 1b상 clinical trial results"],
    ["Company presents Phase II/III study results in oncology", "Company presents 2/3상 study results in oncology"],
    ["BioNTech Reports Global Phase-2-Studie for Pumitamig in Lungenkrebs", "BioNTech Reports Global 2상 Studie for Pumitamig in Lungenkrebs"],
    ["Company reports Phase-2/3-study results in lung cancer", "Company reports 2/3상 study results in lung cancer"],
  ])("localizes clinical phase notation without changing its stage: %s", (title, expected) => {
    expect(normalizeMarketRssHeadlineContext(title)).toBe(expected);
  });

  it("leaves non-clinical project phases unchanged", () => {
    expect(normalizeMarketRssHeadlineContext("Company enters Phase 2 of its global market expansion"))
      .toBe("Company enters Phase 2 of its global market expansion");
    expect(normalizeMarketRssHeadlineContext("Company announces Phase 2 study of its market expansion plan"))
      .toBe("Company announces Phase 2 study of its market expansion plan");
    expect(normalizeMarketRssHeadlineContext("Company announces Phase-2-Studie zur globalen Marktexpansion"))
      .toBe("Company announces Phase-2-Studie zur globalen Marktexpansion");
  });

  it.each([
    ["Zymeworks Presents New Phase 1 Data for Folate Receptor Alpha-Targeting Antibody-Drug Conjugate ZW191 at ESMO Congress 2026", "Zymeworks, ESMO Congress에서 ZW191의 새로운 상 1 데이터를 발표하다", "Zymeworks, ESMO Congress에서 ZW191의 새로운 1상 데이터를 발표하다"],
    ["BioNTech und Bristol Myers Squibb präsentieren Phase-2-Studie mit Pumitamig bei Lungenkrebs", "BioNTech와 Bristol Myers Squibb는 글로벌 -2상 연구에서 데이터를 발표합니다", "BioNTech와 Bristol Myers Squibb는 글로벌 2상 연구에서 데이터를 발표합니다"],
    ["BioNTech and Bristol Myers Squibb Report Global Phase 2 Data for Pumitamig in Advanced NSCLC", "BioNTech는 글로벌 2 상기 데이터를 권장한다고 보고했습니다", "BioNTech는 글로벌 2상 데이터를 권장한다고 보고했습니다"],
    ["Company presents Phase 2/3 study results in lung cancer", "회사는 상 2/3 연구 결과를 발표했습니다", "회사는 2/3상 연구 결과를 발표했습니다"],
  ])("repairs common provider phase-order artifacts only when the source title identifies that phase", (source, translated, expected) => {
    expect(normalizeTranslatedMarketRssClinicalPhase(source, translated)).toBe(expected);
  });

  it("does not rewrite a number that is not a clinical phase in the source title", () => {
    expect(normalizeTranslatedMarketRssClinicalPhase("Company enters Phase 2 of its global market expansion", "회사는 2 상기 시장 확장에 진입합니다"))
      .toBe("회사는 2 상기 시장 확장에 진입합니다");
  });
});
