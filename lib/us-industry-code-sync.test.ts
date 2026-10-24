import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: async () => ({ query: mocks.query, release: mocks.release }) }),
}));

import { auditKisUsIndustryUniverse, isValidKisUsIndustryCode, syncKisUsIndustryCodes } from "@/lib/us-industry-code-sync";

function master(market: "NAS" | "NYS" | "AMS", ticker: string, industryCode: string, securityType = "2") {
  const fields = Array.from({ length: 24 }, () => "");
  fields[2] = market;
  fields[4] = ticker;
  fields[5] = ticker;
  fields[6] = `${ticker} INC`;
  fields[7] = `${ticker} INC`;
  fields[8] = securityType;
  fields[17] = "N";
  fields[19] = industryCode;
  fields[22] = "";
  return Buffer.from(`${fields.join("\t")}\n`, "ascii");
}

describe("KIS U.S. industry code database sync", () => {
  beforeEach(() => {
    mocks.query.mockReset();
    mocks.release.mockReset();
  });

  it("validates KIS's four-character icod field without treating all-zero sentinels as sectors", () => {
    expect(isValidKisUsIndustryCode("730")).toBe(true);
    expect(isValidKisUsIndustryCode("1234")).toBe(true);
    expect(isValidKisUsIndustryCode("000")).toBe(false);
    expect(isValidKisUsIndustryCode("0000")).toBe(false);
    expect(isValidKisUsIndustryCode("12A4")).toBe(false);
    expect(isValidKisUsIndustryCode("12345")).toBe(false);
    expect(isValidKisUsIndustryCode(null)).toBe(false);
  });

  it("audits KIS and both DB partitions read-only and reports row-level universe discrepancies", async () => {
    const auditRows = [
      { market: "NAS", code: "NTEST", is_common_candidate: true, exclusion_reason: "", kis_industry_code: "1234", common_enabled: true, common_instrument_type: "COMMON_STOCK", database_industry_code: "1234", special_enabled: null },
      { market: "NYS", code: "YTEST", is_common_candidate: true, exclusion_reason: "", kis_industry_code: "000", common_enabled: null, common_instrument_type: null, database_industry_code: null, special_enabled: true, special_instrument_type: "COMMON_STOCK" },
      { market: "AMS", code: "ATEST", is_common_candidate: false, exclusion_reason: "DR", kis_industry_code: "000", common_enabled: true, common_instrument_type: "COMMON_STOCK", database_industry_code: null, special_enabled: null },
    ];
    mocks.query.mockImplementation(async (query: string, values?: unknown[]) => {
      if (query === "BEGIN READ ONLY" || query === "COMMIT") return { rowCount: 0, rows: [] };
      expect(query).toContain("FROM jsonb_to_recordset($1::jsonb)");
      expect(query).toContain("us_special_instrument_universe");
      const payload = JSON.parse(String(values?.[0]));
      expect(payload).toHaveLength(4);
      return { rowCount: auditRows.length, rows: auditRows };
    });

    const result = await auditKisUsIndustryUniverse({
      NAS: master("NAS", "NTEST", "1234"),
      NYS: master("NYS", "YTEST", "000"),
      AMS: Buffer.concat([master("AMS", "AMSOK", "710"), master("AMS", "ATEST", "000", "4")]),
    });

    expect(result).toMatchObject({
      mode: "READ_ONLY_KIS_UNIVERSE_AUDIT",
      databaseWritePerformed: false,
      marketSummary: {
        NAS: { matchedActiveCommonCount: 1, candidateMissingActiveCommonCount: 0, activeCommonOutsideKisCandidatesCount: 0, industryMismatchCount: 0 },
        NYS: { matchedActiveCommonCount: 0, candidateMissingActiveCommonCount: 1, activeCommonOutsideKisCandidatesCount: 0 },
        AMS: { matchedActiveCommonCount: 0, candidateMissingActiveCommonCount: 0, activeCommonOutsideKisCandidatesCount: 1, industryMismatchCount: 0 },
      },
    });
    expect(result.discrepancyRows).toHaveLength(2);
    expect(mocks.query.mock.calls.map(([query]) => query)).toEqual(["BEGIN READ ONLY", expect.stringContaining("WITH audit_source AS"), "COMMIT"]);
    expect(mocks.query.mock.calls.some(([query]) => String(query).includes("UPDATE"))).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("serializes the exact snake_case keys expected by PostgreSQL recordset columns", async () => {
    mocks.query.mockImplementation(async (query: string, values?: unknown[]) => {
      if (query.includes("jsonb_to_recordset")) {
        if (query.trimStart().startsWith("UPDATE")) return { rowCount: 1, rows: [] };
        if (!query.includes("COUNT(*) FILTER")) return { rowCount: 0, rows: [] };
        const payload = JSON.parse(String(values?.[0]));
        expect(payload).toHaveLength(1);
        expect(payload[0]).toMatchObject({
          market: expect.stringMatching(/^(NAS|NYS|AMS)$/),
          code: expect.stringMatching(/^[NYA]TEST$/),
          industry_code: expect.stringMatching(/^(730|720|710|1234)$/),
          source_file: expect.stringMatching(/^(NAS|NYS|AMS)MST\.COD$/),
        });
        expect(Object.keys(payload[0]).sort()).toEqual(["code", "industry_code", "market", "source_file"]);
        if (query.includes("COUNT(*) FILTER")) return { rowCount: 1, rows: [{ matched_count: 1, missing_count: 0, mismatch_count: 0, unmatched_codes: [] }] };
        return { rowCount: 0, rows: [] };
      }
      if (query.includes("COUNT(*)")) return { rowCount: 1, rows: [{ market: "NAS", active_common_count: 1, classified_count: 1, unclassified_count: 0 }] };
      return { rowCount: 0, rows: [] };
    });

    const result = await syncKisUsIndustryCodes({
      NAS: master("NAS", "NTEST", "1234"),
      NYS: master("NYS", "YTEST", "720"),
      AMS: master("AMS", "ATEST", "710"),
    });

    expect(result.ok).toBe(true);
    expect(result.persistedCounts).toEqual({ NAS: 1, NYS: 1, AMS: 1 });
    expect(result.validationCounts).toEqual({
      NAS: { matchedCount: 1, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
      NYS: { matchedCount: 1, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
      AMS: { matchedCount: 1, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
    });
    expect(result).not.toHaveProperty("rows");
    expect(mocks.query.mock.calls.map(([query]) => query.trim().split(/\s+/)[0])).toEqual(["BEGIN", "UPDATE", "SELECT", "SELECT", "UPDATE", "SELECT", "SELECT", "UPDATE", "SELECT", "SELECT", "SELECT", "COMMIT"]);
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});
