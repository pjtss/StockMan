import { describe, expect, it } from "vitest";
import { mapDartCandidateToAlert, mapOpenDartRowsToCandidates } from "./dart-automation-mapper";

describe("DART automation mapping", () => {
  it("uses the existing DART score and keeps only bullish candidates", () => {
    const candidates = mapOpenDartRowsToCandidates([
      {
        rcept_no: "20260711000001",
        rcept_dt: "20260711",
        corp_name: "테스트 주식회사",
        report_nm: "단일판매ㆍ공급계약체결",
      },
      {
        rcept_no: "20260711000002",
        rcept_dt: "20260711",
        corp_name: "일반 주식회사",
        report_nm: "기업설명회 개최 안내",
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      receiptNo: "20260711000001",
      judgment: "최강호재",
      keywords: ["공급계약"],
    });
  });

  it("uses detection time for an alert without fabricating a filing time", () => {
    const [candidate] = mapOpenDartRowsToCandidates([
      {
        rcept_no: "20260711000001",
        rcept_dt: "20260711",
        corp_name: "테스트 주식회사",
        report_nm: "잠정 실적",
      },
    ]);

    const alert = mapDartCandidateToAlert(candidate, "2026-07-11T03:00:00.000Z");

    expect(alert.externalId).toBe("20260711000001");
    expect(alert.publishedAt).toBe("2026-07-11T03:00:00.000Z");
    expect(alert.link).toContain("rcpNo=20260711000001");
  });
});
