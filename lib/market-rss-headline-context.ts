const COMMODITY = "(?:corn|wheat|soybeans?|oats|rice|coffee|cocoa|sugar|cotton|crude oil|natural gas|gold|silver|copper)";
const COMPANY_PRODUCT = /\b(?:hardware|devices?|shield|geforce|gpus?|graphics cards?|laptops?|consoles?)\b/i;
const CLINICAL_PHASE_CONTEXT = /\b(?:clinical|oncology|cancer|carcinoma|tumou?r|patient|therapy|therapeutic|treatment|drug|biologic|immunotherapy|esmo|fda|nsclc|pmn|disease|dose|efficacy|safety|indication|medical|kidney|renal|prostate|breast|lung)\b/i;

function normalizeClinicalPhase(title: string) {
  if (!CLINICAL_PHASE_CONTEXT.test(title)) return title;
  const stageValues: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4" };
  return title.replace(/\bphase\s+((?:[1-4][a-c]?|iv|iii|ii|i)(?:\s*\/\s*(?:[1-4][a-c]?|iv|iii|ii|i))?)\b/gi, (_match, rawStage: string) => {
    const stage = rawStage.split("/").map((part) => {
      const normalized = part.trim();
      return stageValues[normalized.toLowerCase()] ?? normalized;
    }).join("/");
    return `${stage}상`;
  });
}

/** Add narrowly targeted market context where common English headline shorthand is ambiguous. */
export function normalizeMarketRssHeadlineContext(title: string) {
  let normalized = normalizeClinicalPhase(title);

  const heldCompany = normalized.match(
    /\b(?:I've|I have|we've|we have)\s+held\s+([A-Z][A-Za-z0-9.&'-]*(?:\s+[A-Z][A-Za-z0-9.&'-]*){0,2})(?=\s+(?:for|since|through|until|and|but|whether|how|what)\b)/i,
  );
  if (heldCompany && /^[A-Z]/.test(heldCompany[1]) && !/\b(?:stock|shares?)\b/i.test(heldCompany[1]) && !COMPANY_PRODUCT.test(heldCompany[1])) {
    normalized = normalized.replace(heldCompany[0], `${heldCompany[0]} stock`);
  }

  normalized = normalized.replace(
    new RegExp(`\\b(${COMMODITY})\\s+(pulls? back|pulling back|pulled back)\\b`, "i"),
    (_match, commodity: string, verb: string) => `${commodity} prices ${verb.toLowerCase()}`,
  );

  normalized = normalized.replace(
    new RegExp(`\\b(${COMMODITY})\\s+(?:face|faces)\\s+risk[- ]off pressure\\b`, "i"),
    (_match, commodity: string) => `${commodity} prices face selling pressure from risk-off sentiment`,
  );

  return normalized;
}
