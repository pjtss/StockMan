export const SEC_ANALYSIS_DECISIONS = ["POSITIVE", "NEGATIVE", "MIXED", "NEUTRAL", "INSUFFICIENT"] as const;
export const SEC_ANALYSIS_CONFIDENCE = ["HIGH", "MEDIUM", "LOW"] as const;
export type SecAnalysisDecision = typeof SEC_ANALYSIS_DECISIONS[number];
export type SecAnalysisConfidence = typeof SEC_ANALYSIS_CONFIDENCE[number];

export type SecCodexAnalysisInput = {
  accession: string;
  cik: string;
  ticker: string | null;
  companyName: string;
  exchange: string | null;
  form: string;
  filingDate: string;
  primaryUrl: string;
  primaryText: string;
};

export type SecCodexAnalysisResult = {
  accession: string;
  decision: SecAnalysisDecision;
  catalysts: string[];
  risks: string[];
  evidence: string[];
  confidence: SecAnalysisConfidence;
  limitations: string[];
};

export function validateSecCodexAnalysis(input: SecCodexAnalysisInput, result: SecCodexAnalysisResult) {
  if (!input.accession || input.accession !== result.accession) throw new Error("SEC analysis accession mismatch");
  if (!input.primaryText.trim()) throw new Error("SEC analysis requires primary FORM text");
  if (!SEC_ANALYSIS_DECISIONS.includes(result.decision)) throw new Error("SEC analysis decision is invalid");
  if (!SEC_ANALYSIS_CONFIDENCE.includes(result.confidence)) throw new Error("SEC analysis confidence is invalid");
  for (const field of [result.catalysts, result.risks, result.evidence, result.limitations]) {
    if (!Array.isArray(field) || field.some((value) => typeof value !== "string" || !value.trim())) throw new Error("SEC analysis list contains invalid values");
  }
  return result;
}
