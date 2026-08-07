export type SecFinancingAnalysis = { detected: boolean; amountUsd: number | null; dilutionRisk: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN"; instruments: string[]; evidence: string[] };
export function analyzeSecFinancing(text: string): SecFinancingAnalysis {
  const source = text || "";
  const evidence = ["ATM", "offering", "registered direct", "PIPE", "convertible", "warrant"].filter((term) => new RegExp(term, "i").test(source));
  const amounts = [...source.matchAll(/\$\s*([\d,.]+)\s*(million|billion|m|bn)?/gi)].map((match) => { const base = Number(match[1].replace(/,/g, "")); const unit = (match[2] || "").toLowerCase(); return base * (unit === "billion" || unit === "bn" ? 1e9 : unit === "million" || unit === "m" ? 1e6 : 1); });
  const instruments = evidence;
  return { detected: evidence.length > 0, amountUsd: amounts.length ? Math.max(...amounts) : null, dilutionRisk: /ATM|offering|convertible|warrant|PIPE/i.test(source) ? "HIGH" : evidence.length ? "MEDIUM" : "UNKNOWN", instruments, evidence };
}
