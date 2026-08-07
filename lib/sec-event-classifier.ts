export type SecEventCategory = "FINANCING" | "M_AND_A" | "CONTRACT" | "INSIDER" | "OWNERSHIP" | "CLINICAL_OR_REGULATORY" | "MANAGEMENT" | "RISK" | "GENERAL";
export type SecEventClassification = { category: SecEventCategory; direction: "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL"; score: number; matchedTerms: string[]; form: string; items: string[] };

const rules: Array<{ category: SecEventCategory; direction: SecEventClassification["direction"]; score: number; terms: RegExp[] }> = [
  { category: "FINANCING", direction: "MIXED", score: 60, terms: [/ATM/i, /offering/i, /registered direct/i, /PIPE/i, /convertible/i, /warrant/i, /financing/i, /증권 발행/i] },
  { category: "M_AND_A", direction: "POSITIVE", score: 70, terms: [/merger/i, /acquisition/i, /business combination/i, /acquire/i] },
  { category: "CONTRACT", direction: "POSITIVE", score: 65, terms: [/material definitive agreement/i, /contract/i, /partnership/i, /license agreement/i] },
  { category: "CLINICAL_OR_REGULATORY", direction: "POSITIVE", score: 75, terms: [/FDA/i, /clinical trial/i, /phase [123]/i, /clearance/i, /approval/i] },
  { category: "MANAGEMENT", direction: "MIXED", score: 35, terms: [/resignation/i, /appointed/i, /chief executive/i, /director/i] },
  { category: "RISK", direction: "NEGATIVE", score: -75, terms: [/going concern/i, /bankruptcy/i, /delisting/i, /reverse split/i, /default/i, /material weakness/i] },
];

export function classifySecEvent(input: { form: string; items?: string; title?: string; body?: string }): SecEventClassification {
  const text = [input.form, input.items || "", input.title || "", input.body || ""].join(" ");
  const matches = rules.map((rule) => ({ ...rule, matchedTerms: rule.terms.filter((term) => term.test(text)).map((term) => term.source) })).filter((rule) => rule.matchedTerms.length);
  if (input.form === "4" || input.form === "3" || input.form === "5") return { category: "INSIDER", direction: "MIXED", score: 45, matchedTerms: [input.form], form: input.form, items: (input.items || "").split(",").filter(Boolean) };
  if (input.form === "SC 13D" || input.form === "SC 13D/A" || input.form === "SC 13G" || input.form === "SC 13G/A") return { category: "OWNERSHIP", direction: "POSITIVE", score: 55, matchedTerms: [input.form], form: input.form, items: [] };
  const strongest = matches.sort((a, b) => Math.abs(b.score) - Math.abs(a.score))[0];
  return strongest ? { category: strongest.category, direction: strongest.direction, score: strongest.score, matchedTerms: strongest.matchedTerms, form: input.form, items: (input.items || "").split(",").filter(Boolean) } : { category: "GENERAL", direction: "NEUTRAL", score: 0, matchedTerms: [], form: input.form, items: (input.items || "").split(",").filter(Boolean) };
}
