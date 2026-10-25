import { DecodingMode, decodeHTML } from "entities";
import { normalizeMarketRssHeadlineContext } from "./market-rss-headline-context";
import { protectMarketRssTranslationTokens } from "./market-rss-translation-protection";

export const MARKET_RSS_TRANSLATION_CONTEXT_MAX_LENGTH = 500;
export const MARKET_RSS_TRANSLATION_HEADLINE_MARKER = '<p id="market-rss-headline">';
export const MARKET_RSS_TRANSLATION_CONTEXT_MARKER = '</p><p id="market-rss-context">';

function replaceLoneSurrogates(value: string) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint >= 0xd800 && codePoint <= 0xdfff ? " " : character;
  }).join("");
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;").replace(/'/g, "&#39;");
}

function decodeHtmlEntities(value: string) {
  const hasInvalidNumericEntity = [...value.matchAll(/&#(?:(\d+)|x([\da-f]+));/gi)].some(([, decimal, hexadecimal]) => {
    const codePoint = decimal ? Number(decimal) : Number.parseInt(hexadecimal, 16);
    return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff);
  });
  return hasInvalidNumericEntity ? null : decodeHTML(value, DecodingMode.Strict);
}

/** Extract only the first translated paragraph from the structured HTML response. */
export function extractMarketRssTranslatedHeadline(translatedHtml: string) {
  const paragraphs = [...translatedHtml.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p\s*>/gi)];
  const headline = paragraphs.filter(([, attributes]) => /\bid\s*=\s*(["'])market-rss-headline\1/i.test(attributes));
  const context = paragraphs.filter(([, attributes]) => /\bid\s*=\s*(["'])market-rss-context\1/i.test(attributes));
  const validHeadlineOnly = paragraphs.length === 1 && headline.length === 1 && context.length === 0;
  const validHeadlineWithContext = paragraphs.length === 2 && headline.length === 1 && context.length === 1;
  if (!validHeadlineOnly && !validHeadlineWithContext) return null;
  const visibleText = headline[0][2]
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?span\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(visibleText)?.replace(/\s+/g, " ").trim() || null;
}

function cleanSummary(summary: string) {
  const visibleText = replaceLoneSurrogates(summary)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi, " ")
    .replace(/&#(?:(\d+)|x([\da-f]+));/gi, (entity, decimal: string | undefined, hexadecimal: string | undefined) => {
      const codePoint = decimal ? Number(decimal) : Number.parseInt(hexadecimal!, 16);
      return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
        ? entity
        : " ";
    });
  const decoded = decodeHTML(visibleText, DecodingMode.Strict);
  const normalized = decoded
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFC");
  return Array.from(normalized).slice(0, MARKET_RSS_TRANSLATION_CONTEXT_MAX_LENGTH).join("").trim();
}

function cleanHeadline(title: string) {
  const visibleText = replaceLoneSurrogates(title)
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?[a-z][\w:-]*(?:\s[^<>]*?)?\s*\/?>/gi, " ")
    .replace(/[\u0000-\u001f\u007f]+/g, " ");
  // parseMarketRss already performs the single XML entity-decoding pass.
  // Decoding HTML again here would reinterpret escaped literal markup as tags.
  return visibleText
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    // Keep NBSP/narrow-NBSP inside locale-formatted financial numbers intact;
    // only collapse ordinary ASCII layout whitespace in the provider input.
    .replace(/[\u0009-\u000d\u0020]+/g, " ")
    .trim()
    .normalize("NFC");
}

/** The exact text sent to the provider; shared by translation, quota accounting, and review fixtures. */
export function prepareMarketRssTranslationInput(title: string, summary = "") {
  const cleanTitle = cleanHeadline(title);
  const normalizedTitle = normalizeMarketRssHeadlineContext(cleanTitle);
  const context = cleanSummary(summary);
  const protectedHeadline = protectMarketRssTranslationTokens(normalizedTitle);
  if (!context && protectedHeadline.placeholders.length > 0) {
    // Send protected financial values/tickers inside provider-supported HTML
    // no-translate spans instead of bare ZXnQ strings. Plain-text translators
    // were dropping or duplicating those marker-shaped tokens in real feeds.
    const htmlHeadline = escapeHtml(protectedHeadline.text).replace(/ZX(\d+)Q/g, (_marker, index: string) =>
      `<span class="notranslate" translate="no">ZX${index}Q</span>`,
    );
    return {
      text: `${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}${htmlHeadline}</p>`,
      headlineText: protectedHeadline.text,
      placeholders: protectedHeadline.placeholders,
      titlePrefix: MARKET_RSS_TRANSLATION_HEADLINE_MARKER,
      titleLength: normalizedTitle.length,
      hasContext: false,
      format: "html" as const,
    };
  }
  const combined = context
    ? `<div>${MARKET_RSS_TRANSLATION_HEADLINE_MARKER}${escapeHtml(protectedHeadline.text)}${MARKET_RSS_TRANSLATION_CONTEXT_MARKER}${escapeHtml(context)}</p></div>`
    : protectedHeadline.text;
  const placeholders = protectedHeadline.placeholders;
  const titlePrefix = context ? MARKET_RSS_TRANSLATION_HEADLINE_MARKER : "";
  return {
    text: combined,
    headlineText: protectedHeadline.text,
    placeholders,
    titlePrefix,
    titleLength: normalizedTitle.length,
    hasContext: Boolean(context),
    format: context ? "html" as const : "text" as const,
  };
}
