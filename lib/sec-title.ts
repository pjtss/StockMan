import type { SecDocumentMetadata, SecDocumentSection } from "./sec-document-parser";

function cleanSentence(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

function stripItemHeading(value: string) {
  return value
    .replace(/^Item\s+\d{1,2}\.\d{2}\s+[^\n.]+\.?\s*/i, "")
    .trim();
}

function firstMaterialParagraph(value: string) {
  const text = stripItemHeading(value);
  const paragraph = text
    .split(/\n{2,}/)
    .map((part) => cleanSentence(part))
    .find((part) => part.length >= 40);
  return paragraph || cleanSentence(text);
}

function normalizeCompanyName(value: string) {
  return value
    .replace(/\s+(Inc\.?|Corporation|Corp\.?|LLC|Ltd\.?)$/i, "")
    .trim();
}

function buildCollaborationHeadline(sentence: string) {
  const match = sentence.match(
    /\band\s+([^()]+?)\s*\([^)]*\)\s+have agreed to expand their .*?\b([A-Za-z-]+\s+collaboration)\s+through\s+(\d{4})/i,
  );
  if (!match) return "";

  const partner = normalizeCompanyName(match[1]);
  const subject = match[2].toLowerCase();
  const year = match[3];
  return `${partner} ${subject} expanded through ${year}`;
}

function fallbackHeadline(sentence: string, maxLength = 120) {
  const withoutLeadingCompany = sentence.replace(/^.+?\([^)]*\)\s+/, "").trim();
  const text = withoutLeadingCompany || sentence;
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

export function buildSecFilingTitle(metadata: SecDocumentMetadata, sections: SecDocumentSection[], fallbackTitle?: string) {
  const company = metadata.registrantName || fallbackTitle || "SEC filing";
  const form = metadata.documentType || "Filing";
  const sourceText = sections[0]?.text || "";
  const sentence = firstMaterialParagraph(sourceText);
  const headline = buildCollaborationHeadline(sentence) || fallbackHeadline(sentence);

  return headline ? `${company} ${form}: ${headline}` : `${company} ${form}`;
}
