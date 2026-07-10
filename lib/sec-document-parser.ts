export type SecDocumentMetadata = {
  documentType: string;
  registrantName: string;
  tradingSymbol: string;
  reportDate: string;
  cik: string;
  accessionNumber: string;
  documentFile: string;
  canonicalUrl: string;
};

export type SecDocumentSection = {
  item: string;
  title: string;
  text: string;
};

export type PreparedSecDocument = {
  fullText: string;
  aiText: string;
  promptText: string;
  metadata: SecDocumentMetadata;
  sections: SecDocumentSection[];
};

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[\u2009\u200a\u200b]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(fragment: string) {
  return normalizeWhitespace(decodeHtmlEntities(fragment.replace(/<[^>]+>/g, " ")));
}

export function htmlToSecText(html: string) {
  const visibleHtml = html
    .replace(/<ix:header[\s\S]*?<\/ix:header>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<div[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/div>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|table|h[1-6]|li)>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ");

  return stripTags(visibleHtml);
}

function extractInlineValue(html: string, name: string) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<ix:nonNumeric[^>]*name=["']${escapedName}["'][^>]*>([\\s\\S]*?)<\\/ix:nonNumeric>`, "i");
  const match = html.match(pattern);
  return match ? stripTags(match[1]) : "";
}

export function extractSecDocumentMetadata(
  html: string,
  text: string,
  urlInfo?: Partial<Pick<SecDocumentMetadata, "cik" | "accessionNumber" | "documentFile" | "canonicalUrl">>,
): SecDocumentMetadata {
  const documentType = extractInlineValue(html, "dei:DocumentType") || text.match(/\bFORM\s+([A-Z0-9-]+)/i)?.[1] || "";
  const registrantName = extractInlineValue(html, "dei:EntityRegistrantName");
  const tradingSymbol = extractInlineValue(html, "dei:TradingSymbol");
  const reportDate = extractInlineValue(html, "dei:DocumentPeriodEndDate");

  return {
    documentType,
    registrantName,
    tradingSymbol,
    reportDate,
    cik: urlInfo?.cik || extractInlineValue(html, "dei:EntityCentralIndexKey"),
    accessionNumber: urlInfo?.accessionNumber || "",
    documentFile: urlInfo?.documentFile || "",
    canonicalUrl: urlInfo?.canonicalUrl || "",
  };
}

function trimAtFirstPattern(value: string, patterns: RegExp[]) {
  const indexes = patterns
    .map((pattern) => value.search(pattern))
    .filter((index) => index > 0);
  if (indexes.length === 0) return value;
  return value.slice(0, Math.min(...indexes)).trim();
}

function removeSentimentNoise(value: string) {
  const trimmed = trimAtFirstPattern(value, [
    /\bCautionary Note Regarding Forward-Looking Statements\b/i,
    /\bForward-Looking Statements\b/i,
    /\bSIGNATURE\b/i,
  ]);
  return trimmed.length >= 80 ? trimmed : value.trim();
}

export function extractSecItemSections(text: string): SecDocumentSection[] {
  const body = trimAtFirstPattern(text, [/\bSIGNATURE\b/i]);
  const matches = [...body.matchAll(/\bItem\s+(\d{1,2}\.\d{2})\s+([\s\S]*?)(?=\bItem\s+\d{1,2}\.\d{2}\b|$)/gi)];

  return matches
    .map((match) => {
      const item = match[1];
      const rawBlock = normalizeWhitespace(`Item ${item} ${match[2]}`);
      const titleMatch = rawBlock.match(new RegExp(`^Item\\s+${item.replace(".", "\\.")}\\s+([^\\n.]{1,140})\\.?`, "i"));
      const title = titleMatch?.[1]?.trim() || "";
      return {
        item,
        title,
        text: removeSentimentNoise(rawBlock),
      };
    })
    .filter((section) => section.text.length > 0);
}

export function buildSecAiText(fullText: string, sections: SecDocumentSection[]) {
  const source = sections.length > 0 ? sections.map((section) => section.text).join("\n\n") : fullText;
  return removeSentimentNoise(source);
}

export function buildSecPromptText(metadata: SecDocumentMetadata, aiText: string) {
  const header = [
    metadata.registrantName ? `Company: ${metadata.registrantName}` : "",
    metadata.tradingSymbol ? `Ticker: ${metadata.tradingSymbol}` : "",
    metadata.documentType ? `Form: ${metadata.documentType}` : "",
    metadata.reportDate ? `Report date: ${metadata.reportDate}` : "",
    metadata.accessionNumber ? `Accession: ${metadata.accessionNumber}` : "",
  ].filter(Boolean);

  return [...header, "", "Material filing text:", aiText].join("\n");
}

export function prepareSecDocument(
  html: string,
  urlInfo?: Partial<Pick<SecDocumentMetadata, "cik" | "accessionNumber" | "documentFile" | "canonicalUrl">>,
): PreparedSecDocument {
  const fullText = htmlToSecText(html);
  const sections = extractSecItemSections(fullText);
  const metadata = extractSecDocumentMetadata(html, fullText, urlInfo);
  const aiText = buildSecAiText(fullText, sections);

  return {
    fullText,
    aiText,
    promptText: buildSecPromptText(metadata, aiText),
    metadata,
    sections,
  };
}
