import { describe, expect, it } from "vitest";
import { validateSecCodexAnalysis, type SecCodexAnalysisInput, type SecCodexAnalysisResult } from "./sec-codex-analysis-contract";

const input: SecCodexAnalysisInput = { accession: "0000000001-26-000001", cik: "0000000001", ticker: "ABC", companyName: "Example", exchange: "NASDAQ", form: "8-K", filingDate: "2026-09-27", primaryUrl: "https://www.sec.gov/Archives/example.htm", primaryText: "Item 1.01 material agreement" };
const result: SecCodexAnalysisResult = { accession: input.accession, decision: "POSITIVE", catalysts: ["계약 체결"], risks: ["계약 조건 확인 필요"], evidence: ["Item 1.01"], confidence: "MEDIUM", limitations: [] };

describe("SEC Codex analysis contract", () => {
  it("accepts an accession-linked result with primary text", () => expect(validateSecCodexAnalysis(input, result)).toBe(result));
  it("rejects results when the FORM body is absent", () => expect(() => validateSecCodexAnalysis({ ...input, primaryText: " " }, result)).toThrow("primary FORM text"));
});
