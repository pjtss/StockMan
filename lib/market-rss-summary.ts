import { decodeHTML } from "entities";

const CORE_SUMMARY_MAX_SENTENCES = 3;
const CORE_SUMMARY_MAX_CHARS = 600;
const BOILERPLATE_START = /^(?:about (?:the )?(?:company|us)|forward-looking statements|investor relations|media contact|contact information|source:|view source version|to view this release|for more information,? visit)\b/i;
const METADATA_ONLY_SUMMARY = /^(?:Filed:\s*\d{4}-\d{2}-\d{2}\s+Acc(?:ession)?\s*No:|News\s+Category\s+Alert\s+Markets\s+What\s+You\s+Need\s+To\s+Know\s+Trader\s+Alerts\b)/i;

function toPlainText(input: string): string {
  let text = input
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  for (let pass = 0; pass < 3; pass++) {
    const decoded = decodeHTML(text);
    if (decoded === text) break;
    text = decoded;
  }
  return text
    .replace(/(\d)\.\s+(?=\d)/g, "$1.")
    .trimStart()
    .replace(/^[A-Z][A-Z .'-]+,\s+[A-Z][a-z]{2,9}\.?\s+\d{1,2},\s+\d{4}\s+\(GLOBE NEWSWIRE\)\s*(?:--|[-–—])\s*/i, "")
    .normalize("NFC");
}

/**
 * Converts publisher RSS summary markup into a short, deterministic text excerpt.
 * This is extraction/format cleanup, not an AI-generated or inferred summary.
 */
export function extractMarketRssCoreSummary(input: unknown, fallback = ""): string {
  const fallbackText = typeof fallback === "string"
    ? toPlainText(fallback).replace(/\s+\|\s+[A-Z0-9.-]+\s+Stock News$/i, "").replace(/\s+/g, " ").trim()
    : "";
  if (typeof input !== "string" || !input.trim()) return fallbackText;

  const text = toPlainText(input);
  const normalizedInput = text
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (METADATA_ONLY_SUMMARY.test(normalizedInput)) return fallbackText;

  const lines = normalizedInput
    .split(/\r?\n/)
    .map((line) => line.replace(/[\t\f\v ]+/g, " ").trim())
    .filter(Boolean);
  const bodyLines: string[] = [];
  for (const line of lines) {
    if (BOILERPLATE_START.test(line)) break;
    if (bodyLines.at(-1) !== line) bodyLines.push(line);
  }

  const body = bodyLines.join(" ").replace(/\s+/g, " ").trim();
  if (!body) return fallbackText;

  const sentences = body.split(/(?<=[.!?])\s+(?=[A-Z“"'])/).map((part) => part.trim()).filter(Boolean);
  const coreSentences: string[] = [];
  for (const sentence of sentences) {
    if (BOILERPLATE_START.test(sentence)) break;
    coreSentences.push(sentence);
    if (coreSentences.length >= CORE_SUMMARY_MAX_SENTENCES) break;
  }
  let result = coreSentences.join(" ");
  if (result.length > CORE_SUMMARY_MAX_CHARS) {
    const clipped = result.slice(0, CORE_SUMMARY_MAX_CHARS + 1);
    const boundary = clipped.lastIndexOf(" ");
    result = clipped.slice(0, boundary > CORE_SUMMARY_MAX_CHARS * 0.6 ? boundary : CORE_SUMMARY_MAX_CHARS).trimEnd();
  }
  return result || fallbackText;
}
