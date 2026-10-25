import { describe, expect, it } from "vitest";
import { buildStoredMarketRssTranslationRetryState, validateStoredMarketRssTranslation } from "./market-rss-notification-translation-validation";

describe("stored RSS title validation before Discord delivery", () => {
  it("holds a legacy operational translation that dropped a closing clinical acronym delimiter", () => {
    const result = validateStoredMarketRssTranslation(
      "Libtayo® (cemiplimab) Longer-Term Data Show Increasing and Clinically Meaningful Overall Survival Benefit with Adjuvant Treatment in High-Risk Cutaneous Squamous Cell Carcinoma (CSCC)",
      "Libtayo®(세미플림맙) 장기 데이터는 고위험 피부 편평세포암에서 보조제 치료가 증가하고 임상적으로 의미 있는 전체 생존 이점을 증가시킨다는 것을 보여줍니다 (CSCC",
    );

    expect(result).toMatchObject({ ok: false, reason: "translation_output_incomplete" });
  });

  it("repairs only a source-confirmed clinical phase artifact in an older stored translation", () => {
    const result = validateStoredMarketRssTranslation(
      "Zymeworks Presents New Phase 1 Data for Folate Receptor Alpha-Targeting Antibody-Drug Conjugate ZW191 at ESMO Congress 2026 | ZYME Stock News",
      "Zymeworks, ESMO Congress에서 엽산 수용체 알파 표적 항체-약물 접합체인 ZW191의 새로운 상 1 데이터를 발표 2026 | ZYME 주식 뉴스",
    );

    expect(result).toEqual({
      ok: true,
      translatedTitle: "Zymeworks, ESMO Congress에서 엽산 수용체 알파 표적 항체-약물 접합체인 ZW191의 새로운 1상 데이터를 발표 2026 | ZYME 주식 뉴스",
      changed: true,
    });
  });

  it("repairs source-confirmed pharmaceutical terms in an older stored translation before delivery", () => {
    const result = validateStoredMarketRssTranslation(
      "BioNTech and Bristol Myers Squibb Report Encouraging Global Phase 2 Data for Pumitamig in Advanced NSCLC After Progression on Immunotherapy Plus Chemotherapy",
      "BioNTech와 Bristol Myers Squibb는 면역요법과 화학요법 진행 후 진행된 후기 NSCLC에서 푸미타믹의 글로벌 2 상기 데이터를 권장한다고 보고했습니다",
    );

    expect(result).toEqual({
      ok: true,
      translatedTitle: "BioNTech와 Bristol Myers Squibb는 면역요법과 화학요법 진행 후 진행성 비소세포폐암에서 푸미타믹의 글로벌 2상 데이터를 고무적이라고 보고했습니다",
      changed: true,
    });
  });

  it("holds stored text that does not meet the Korean target-language floor", () => {
    expect(validateStoredMarketRssTranslation("Nvidia revenue rises sharply after earnings", "Nvidia update"))
      .toMatchObject({ ok: false, reason: "target_language_not_detected" });
  });

  it("returns a failed translation state so the existing retry queue can repair the title", () => {
    const checked = validateStoredMarketRssTranslation("Nvidia revenue rises sharply after earnings", "Nvidia update");
    expect(checked.ok).toBe(false);
    if (checked.ok) throw new Error("Expected an invalid stored translation");
    const attemptedAt = new Date("2026-10-26T00:00:00.000Z");

    expect(buildStoredMarketRssTranslationRetryState({ title: "Nvidia revenue rises sharply after earnings", translationAttempts: 1 }, checked, attemptedAt)).toEqual({
      translatedTitle: "Nvidia revenue rises sharply after earnings",
      translationCandidateTitle: "Nvidia update",
      translationStatus: "FAILED",
      translationFallback: true,
      translationSkippedReason: "target_language_not_detected",
      translationError: "Stored title failed send-time validation and must be translated again.",
      translationTranslatedAt: null,
      translationAttemptedAt: attemptedAt,
      translationAttempts: 2,
      updatedAt: attemptedAt,
    });
  });
});
