const VALID_DECISIONS = new Set(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE", "INSUFFICIENT"]);
const VALID_CONFIDENCE = new Set(["HIGH", "MEDIUM", "LOW"]);

/** Validates the result written by Codex; this module does not classify RSS content. */
export function validateCodexAnalysis(value) {
  if (!value || !VALID_DECISIONS.has(value.decision) || typeof value.catalyst !== "string"
    || typeof value.analysis_ko !== "string" || typeof value.evidence !== "string"
    || typeof value.risks !== "string" || !VALID_CONFIDENCE.has(value.confidence)
    || (value.ticker != null && value.ticker !== "" && !/^[A-Z][A-Z0-9.-]{0,9}$/i.test(String(value.ticker)))) {
    throw new Error("분석 결과가 요구 스키마와 일치하지 않습니다.");
  }
  return { ...value, ticker: value.ticker ? String(value.ticker).toUpperCase() : "" };
}
