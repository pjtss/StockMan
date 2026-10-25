const COMMODITY = "(?:corn|wheat|soybeans?|oats|rice|coffee|cocoa|sugar|cotton|crude oil|natural gas|gold|silver|copper)";
const COMPANY_PRODUCT = /\b(?:hardware|devices?|shield|geforce|gpus?|graphics cards?|laptops?|consoles?)\b/i;
const CLINICAL_PHASE_CONTEXT = /\b(?:clinical|oncology|cancer|carcinoma|tumou?r|patient|therapy|therapeutic|treatment|drug|biologic|immunotherapy|esmo|fda|nsclc|pmn|disease|dose|efficacy|safety|indication|medical|kidney|renal|prostate|breast|lung|krebs|lungenkrebs|karzinom|tumor|patienten|therapie|behandlung|immuntherapie|onkologie|erkrankung|wirksamkeit|verträglichkeit)\b/i;

function normalizeClinicalPhase(title: string) {
  if (!CLINICAL_PHASE_CONTEXT.test(title)) return title;
  const stageValues: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4" };
  const normalized = title.replace(/\bphase[-\s]+((?:[1-4][a-c]?|iv|iii|ii|i)(?:\s*\/\s*(?:[1-4][a-c]?|iv|iii|ii|i))?)\b/gi, (_match, rawStage: string) => {
    const stage = rawStage.split("/").map((part) => {
      const normalized = part.trim();
      return stageValues[normalized.toLowerCase()] ?? normalized;
    }).join("/");
    return `${stage}상`;
  });
  return normalized.replace(/((?:[1-4][a-c]?|[1-4]\s*\/\s*[1-4])상)-(?=(?:study|studie|trial)\b)/gi, "$1 ");
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

/** Correct provider title artifacts only when the original headline clearly names a clinical phase. */
export function normalizeTranslatedMarketRssClinicalPhase(sourceTitle: string, translatedTitle: string) {
  const normalizedSource = normalizeMarketRssHeadlineContext(sourceTitle);
  const stages = [...normalizedSource.matchAll(/(?<![\p{L}\p{N}])([1-4][a-c]?|[1-4]\s*\/\s*[1-4])상(?![\p{L}\p{N}])/giu)]
    .map(([, stage]) => stage.replace(/\s+/g, ""));
  let normalized = translatedTitle;
  for (const stage of new Set(stages)) {
    const stagePattern = stage.replace(/\//g, "\\s*\\/\\s*");
    normalized = normalized
      .replace(new RegExp(`(?<![\\p{L}\\p{N}])상\\s*${stagePattern}(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`)
      .replace(new RegExp(`(?:-|–|—)\\s*${stagePattern}\\s*상(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`)
      .replace(new RegExp(`(?<![\\p{L}\\p{N}])${stagePattern}\\s+상기(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`)
      .replace(new RegExp(`(?<![\\p{L}\\p{N}])${stagePattern}\\s*단계(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`)
      .replace(new RegExp(`단계\\s*${stagePattern}(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`)
      .replace(new RegExp(`(?<![\\p{L}\\p{N}])${stagePattern}\\s+상(?![\\p{L}\\p{N}])`, "giu"), `${stage}상`);
  }
  return normalized;
}

/** Repair a few source-confirmed pharmaceutical terms that providers render as false friends. */
export function normalizeTranslatedMarketRssKnownPhrases(sourceTitle: string, translatedTitle: string) {
  let normalized = translatedTitle;
  if (/\bencouraging\b/i.test(sourceTitle)) {
    normalized = normalized
      .replace(/권장한다고(?=\s*(?:보고|발표|전했습니다))/gu, "고무적이라고")
      .replace(/권장하는(?=\s*(?:데이터|결과|소식))/gu, "고무적인")
      .replace(/권장한(?=\s*(?:데이터|결과|소식))/gu, "고무적인");
  }
  if (/\boral\s+session\b/i.test(sourceTitle)) {
    normalized = normalized.replace(/구강\s*세션/gu, "구두 발표 세션");
  }
  if (/\badvanced\s+(?:NSCLC|non[-\s]small[-\s]cell\s+lung\s+cancer)\b/i.test(sourceTitle)) {
    normalized = normalized
      .replace(/((?:면역요법|면역치료).{0,20}화학요법\s*진행\s*후)\s*진행된\s*(?:후기\s*)?NSCLC/gu, "$1 진행성 비소세포폐암")
      .replace(/후기\s*(?:NSCLC|비소세포폐암)/gu, "진행성 비소세포폐암");
  }
  return normalized;
}
