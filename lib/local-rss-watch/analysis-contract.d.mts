export type CodexAnalysisDecision = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE" | "INSUFFICIENT";
export type CodexAnalysisConfidence = "HIGH" | "MEDIUM" | "LOW";
export interface CodexAnalysisResult {
  decision: CodexAnalysisDecision;
  ticker?: string | null;
  catalyst: string;
  analysis_ko: string;
  evidence: string;
  risks: string;
  confidence: CodexAnalysisConfidence;
}
export function validateCodexAnalysis(value: unknown): CodexAnalysisResult & { ticker: string };
