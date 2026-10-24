import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));

vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: async () => ({ query: mocks.query, release: mocks.release }) }),
}));

import { isValidKisUsIndustryCode, syncKisUsIndustryCodes } from "@/lib/us-industry-code-sync";

function master(market: "NAS" | "NYS" | "AMS", ticker: string, industryCode: string) {
  const fields = Array.from({ length: 24 }, () => "");
  fields[2] = market;
  fields[4] = ticker;
  fields[5] = ticker;
  fields[6] = `${ticker} INC`;
  fields[7] = `${ticker} INC`;
  fields[8] = "2";
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
