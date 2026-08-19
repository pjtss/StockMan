import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDomestic, parseOverseas } from "@/lib/instrument-universe-import";

const masterDir = path.join(process.cwd(), "docs", "references", "kis-instrument-masters", "2026-08-18");

describe("KIS instrument master parsers", () => {
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
  });
  it("parses overseas tab masters and preserves market mapping", async () => {
    const buffer = await readFile(path.join(masterDir, "NASMST.COD"));
    const rows = parseOverseas(buffer, "NAS", "NASMST.COD");
    expect(rows.length).toBeGreaterThan(4000);
    expect(rows[0]).toMatchObject({ market: "NAS", code: "AAAP", currency: "USD" });
    expect(rows.some((row) => row.isEtf)).toBe(true);
  });
});
