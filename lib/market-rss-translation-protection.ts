import { transformMarketRssProtectedTokens } from "./market-rss-translation-tokens.mjs";

export type ProtectedTranslationText = {
  text: string;
  placeholders: Array<{ marker: string; original: string }>;
};

export function protectMarketRssTranslationTokens(text: string): ProtectedTranslationText {
  const protectedTokens = transformMarketRssProtectedTokens(text, (original, index) => {
    const marker = `ZX${index}Q`;
    return marker;
  });
  return {
    text: protectedTokens.text,
    placeholders: protectedTokens.tokens.map((original, index) => ({ marker: `ZX${index}Q`, original })),
  };
}

export function restoreMarketRssTranslationTokens(translatedText: string, placeholders: ProtectedTranslationText["placeholders"]) {
  const expectedMarkers = new Set(placeholders.map(({ marker }) => marker));
  const returnedMarkers = [...translatedText.matchAll(/ZX\d+Q/g)].map(([marker]) => marker);
  if (returnedMarkers.some((marker) => !expectedMarkers.has(marker))) return { ok: false as const, text: translatedText };
  for (const { marker } of placeholders) {
    const occurrences = translatedText.split(marker).length - 1;
    if (occurrences !== 1) return { ok: false as const, text: translatedText };
  }
  const restored = placeholders.reduce((text, { marker, original }) => text.replace(marker, original), translatedText);
  return { ok: true as const, text: restored };
}
