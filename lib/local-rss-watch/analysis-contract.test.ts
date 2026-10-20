import { describe, expect, it } from "vitest";
import { validateCodexAnalysis } from "./analysis-contract.mjs";

const valid = {
  decision: "POSITIVE",
  ticker: "nvda",
  catalyst: "공식 공급 계약",
  analysis_ko: "계약 상대와 조건이 원문에 명시되어 있습니다.",
  evidence: "Company release confirms a supply agreement.",
  risks: "계약 금액과 매출 인식 시점은 공개되지 않았습니다.",
  confidence: "MEDIUM",
};

describe("Codex RSS analysis contract", () => {
  it("normalizes a valid ticker but leaves the judgement to Codex", () => {
    expect(validateCodexAnalysis(valid)).toEqual({ ...valid, ticker: "NVDA" });
  });

  it("allows no ticker when it cannot be established and requires an explicit uncertainty decision", () => {
    expect(validateCodexAnalysis({ ...valid, decision: "INSUFFICIENT", ticker: null }).ticker).toBe("");
    const normalized = validateCodexAnalysis({ ...valid, decision: "INSUFFICIENT", ticker: null });
    expect(validateCodexAnalysis(normalized)).toEqual(normalized);
    expect(validateCodexAnalysis({ ...valid, decision: "INSUFFICIENT", ticker: "" }).ticker).toBe("");
  });

  it.each([
    { ...valid, decision: "MAYBE" },
    { ...valid, ticker: "NVDA;DROP" },
    { ...valid, evidence: undefined },
    { ...valid, confidence: "CERTAIN" },
  ])("rejects an invalid result shape", (value) => {
    expect(() => validateCodexAnalysis(value)).toThrow("요구 스키마");
  });
});
