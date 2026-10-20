import { describe, expect, it } from "vitest";
import { getTranslationUsageDiagnosticLine } from "./translation-usage-display";

describe("translation usage diagnostic line", () => {
  it("shows retained quota reservation separately from successfully recorded translation", () => {
    expect(getTranslationUsageDiagnosticLine({ apiCalls: 2, apiFailures: 1, reservedCharacters: 80, translatedCharacters: 40 }))
      .toBe("캐시 0건 · Google 호출 2건(실패 1) · 월간 한도 반영(예약 포함) 80자 · 번역량 누적 40자 · 한도 fallback 0건");
  });

  it("surfaces every secondary persistence failure and omits zero warnings", () => {
    const line = getTranslationUsageDiagnosticLine({
      cacheWriteFailures: 1,
      usageRecordFailures: 2,
      cacheInvalidationFailures: 3,
      reservationReleaseFailures: 4,
    });
    expect(line).toContain("번역 캐시 저장 실패 1건");
    expect(line).toContain("번역량 누적 실패 2건");
    expect(line).toContain("오류 캐시 삭제 실패 3건");
    expect(line).toContain("한도 예약 회수 실패 4건");
    expect(getTranslationUsageDiagnosticLine({ reservationReleaseFailures: 0 })).not.toContain("실패 0건");
  });
});
