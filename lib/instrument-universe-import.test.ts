import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyKr, classifyUs, INSTRUMENT_MASTER_MISSING_GRACE_RUNS, KR_MASTER_OFFSETS, nextMissingMasterState, parseDomestic, parseOverseas } from "@/lib/instrument-universe-import";

const masterDir = path.join(process.cwd(), "docs", "references", "kis-instrument-masters", "2026-08-18");

describe("KIS instrument master parsers", () => {
  it("tolerates one complete-master omission and disables only after the second consecutive omission", () => {
    expect(INSTRUMENT_MASTER_MISSING_GRACE_RUNS).toBe(2);
    expect(nextMissingMasterState(0)).toEqual({ missingRuns: 1, enabled: true });
    expect(nextMissingMasterState(1)).toEqual({ missingRuns: 2, enabled: false });
    expect(nextMissingMasterState(2)).toEqual({ missingRuns: 3, enabled: false });
  });

  it("parses domestic fixed-width masters without changing source rows", async () => {
    const buffer = await readFile(path.join(masterDir, "kosdaq_code.mst"));
    const rows = parseDomestic(buffer, "KOSDAQ", "kosdaq_code.mst");
    expect(rows.length).toBeGreaterThan(1000);
    expect(rows[0]).toMatchObject({ market: "KOSDAQ", code: "900110", standardCode: "HK0000057197" });
    expect(rows[0].rawPayload.length).toBeGreaterThan(100);
    // CP949 names are two bytes wide.  The security-group field must still be
    // read at the official byte offset; otherwise BC/EF products are shifted
    // into the name and later misclassified as common stocks.
    const kospi = parseDomestic(await readFile(path.join(masterDir, "kospi_code.mst")), "KOSPI", "kospi_code.mst");
    const fund = kospi.find((row) => row.securityGroupCode === "BC");
    expect(fund).toBeDefined();
    expect(fund?.name).not.toContain("BC");
    const etn = kospi.find((row) => row.securityGroupCode === "EN");
    expect(etn).toBeDefined();
    expect(etn && classifyKr(etn)).toMatchObject({ instrumentType: "EXCLUDED_PRODUCT", isEtp: true });
    expect(kospi.some((row) => /스팩|SPAC|우선주|우\(전환\)/i.test(row.name))).toBe(true);
    expect(KR_MASTER_OFFSETS).toEqual({
      KOSPI: { etp: 83, halt: 121, liquidation: 122, managed: 123, preferred: 220 },
      KOSDAQ: { etp: 79, halt: 116, liquidation: 117, managed: 118, preferred: 215 },
    });
    for (const [source, market, code] of [
      ["kospi_code.mst", "KOSPI", "005930"],
      ["kosdaq_code.mst", "KOSDAQ", "293490"],
    ] as const) {
      const sourceRows = parseDomestic(await readFile(path.join(masterDir, source)), market, source);
      const ordinary = sourceRows.find((row) => row.code === code);
      expect(ordinary, `${market} ${code} should be present in the checked-in official master fixture`).toBeDefined();
      expect(ordinary?.tradingHaltCode).toBe("N");
      expect(ordinary?.liquidationCode).toBe("N");
      expect(ordinary?.managedIssueCode).toBe("N");
      expect(ordinary && classifyKr(ordinary).isSuspended).toBe(false);
    }
    const spac = rows.find((row) => /스팩|SPAC/i.test(row.name));
    expect(spac && classifyKr(spac).instrumentType).toBe("EXCLUDED_PRODUCT");
  });
  it("parses overseas tab masters and preserves market mapping", async () => {
    const buffer = await readFile(path.join(masterDir, "NASMST.COD"));
    const rows = parseOverseas(buffer, "NAS", "NASMST.COD");
    expect(rows.length).toBeGreaterThan(4000);
    expect(rows[0]).toMatchObject({ market: "NAS", code: "AAAP", currency: "USD" });
    expect(rows.some((row) => row.isEtf)).toBe(true);
  });

  it("excludes KIS abbreviated SPAC units, preferred issues, warrants, and rights from common stocks", () => {
    const base = { securityType: "2", etpType: "", isEtf: false, isLeveraged: false, isInverse: false, isWarrant: false, isDerivative: false, isDr: false };
    expect(classifyUs({ ...base, code: "ANSCU", name: "애그리컬처 애퀴지션 유닛", englishName: "AGRICULTURE & NAT SOLUTIONS ACQ COR UNIT 1 CL A" }))
      .toMatchObject({ instrumentType: "SPAC", isDerivative: true });
    expect(classifyUs({ ...base, code: "GRAF/UN", name: "그래프 글로벌 유닛", englishName: "GRAF GLOBAL CORP UNIT 1 ORD SHS" }))
      .toMatchObject({ instrumentType: "DERIVATIVE", isDerivative: true });
    expect(classifyUs({ ...base, code: "MDV/A", name: "모디브 우선주 A", englishName: "MODIV INDUSTRIAL INC 7.375% CUM RED PERP PFD STOCK SER A" }))
      .toMatchObject({ instrumentType: "DERIVATIVE", isDerivative: true });
    expect(classifyUs({ ...base, code: "ABCD/WS", name: "테스트 워런트", englishName: "TEST CORP WARRANTS" }))
      .toMatchObject({ instrumentType: "DERIVATIVE", isWarrant: true, isDerivative: true });
    expect(classifyUs({ ...base, code: "ABCD/RT", name: "테스트 권리주", englishName: "TEST CORP RIGHTS" }))
      .toMatchObject({ instrumentType: "DERIVATIVE", isDerivative: true });
  });

  it("keeps ordinary class A/B shares eligible", () => {
    const base = { securityType: "2", etpType: "", isEtf: false, isLeveraged: false, isInverse: false, isWarrant: false, isDerivative: false, isDr: false };
    expect(classifyUs({ ...base, code: "BRK/B", name: "버크셔 해서웨이 클래스 B", englishName: "BERKSHIRE HATHAWAY INC CL B" }))
      .toMatchObject({ instrumentType: "COMMON_STOCK", isDerivative: false, isWarrant: false });
  });

  it("does not mistake aerospace or space company names for SPACs", () => {
    const base = { securityType: "2", etpType: "", isEtf: false, isLeveraged: false, isInverse: false, isWarrant: false, isDerivative: false, isDr: false };
    for (const [code, name, englishName] of [
      ["ASTS", "AST 스페이스모바일", "AST SPACEMOBILE INC"],
      ["BAER", "브리저 에어로스페이스 그룹", "BRIDGER AEROSPACE GROUP HOLDINGS INC"],
      ["GE", "GE 에어로스페이스", "GE AEROSPACE"],
    ]) {
      expect(classifyUs({ ...base, code, name, englishName })).toMatchObject({ instrumentType: "COMMON_STOCK" });
    }
  });

  it("recognizes acquisition-company plurals and abbreviated C/WTS warrants", () => {
    const base = { securityType: "2", etpType: "", isEtf: false, isLeveraged: false, isInverse: false, isWarrant: false, isDerivative: false, isDr: false };
    expect(classifyUs({ ...base, code: "IRHO", name: "아이언 호스 애퀴지션 II", englishName: "IRON HORSE ACQUISITIONS II CORP" }))
      .toMatchObject({ instrumentType: "SPAC" });
    expect(classifyUs({ ...base, code: "BAERW", name: "브리저 에어로스페이스 그룹 콜 워런트", englishName: "BRIDGER AEROSPACE GROUP C/WTS 24/01/2028" }))
      .toMatchObject({ instrumentType: "DERIVATIVE", isWarrant: true });
  });

  it("excludes listed debt notes from the common-stock universe", () => {
    const base = { securityType: "2", etpType: "", isEtf: false, isLeveraged: false, isInverse: false, isWarrant: false, isDerivative: false, isDr: false };
    expect(classifyUs({ ...base, code: "TRINI", name: "트리니티 캐피털 선순위채권", englishName: "TRINITY CAPITAL INC 7.875% NTS 30/09/2029" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "TRINZ", name: "트리니티 캐피털 채권", englishName: "TRINITY CAPITAL INC 7.875% NOTES DUE 2029" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "BWNB", name: "밥콕 선순위채권", englishName: "BABCOCK & WILCOX ENTERPRISES INC 6.5% SENIOR NOTES 31/12" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "DUKU", name: "듀크 에너지 7.375% 선순위채권", englishName: "DUKE ENERGY CORP 7.375% SNR 01/08/2029 USD" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "FGN", name: "F&G 어뉴어티스 앤드 라이프 선순위채권", englishName: "F&G ANNUITIES & LIFE INC 7.95% SNR NTS 15/12/2053 US" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "JSM", name: "내비언트 선순위채권", englishName: "NAVIENT CORP 6% SNR NTS 15/12/43 USD25" }))
      .toMatchObject({ instrumentType: "DEBT_SECURITY", isDerivative: true, isDebtSecurity: true });
    expect(classifyUs({ ...base, code: "TRIN", name: "트리니티 캐피털", englishName: "TRINITY CAPITAL INC COMMON STOCK" }))
      .toMatchObject({ instrumentType: "COMMON_STOCK", isDerivative: false, isDebtSecurity: false });
  });

  it("routes leveraged and inverse products away from the common-stock universe", () => {
    const base = { code: "TEST", name: "테스트", englishName: "TEST INC", securityType: "2", etpType: "", isEtf: false, isWarrant: false, isDerivative: false, isDr: false };
    expect(classifyUs({ ...base, isLeveraged: true })).toMatchObject({ instrumentType: "DERIVATIVE", isDerivative: true });
    expect(classifyUs({ ...base, isLeveraged: false, isInverse: true })).toMatchObject({ instrumentType: "DERIVATIVE", isDerivative: true });
  });
});
