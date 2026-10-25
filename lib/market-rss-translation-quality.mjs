const MIN_KOREAN_LETTERS = 2;
// Headlines often preserve several issuer, product, and place names in their
// source spelling. Keep a modest Korean-content floor without rejecting a
// mostly translated title merely because those names are long.
const MIN_KOREAN_LETTER_RATIO = 0.18;
const SOURCE_FUNCTION_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "before", "been", "being", "by", "for", "from", "has", "have", "i", "if", "in", "is", "it", "of", "on", "or", "the", "to", "was", "were", "we", "whether", "while", "with",
]);

const TITLE_DELIMITER_PAIRS = [
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["（", "）"],
  ["［", "］"],
  ["｛", "｝"],
];

function hasBalancedTitleDelimiters(text) {
  const normalized = text.normalize("NFC").replace(/ZX\d+Q/g, "");
  return TITLE_DELIMITER_PAIRS.every(([open, close]) => {
    let depth = 0;
    for (const character of normalized) {
      if (character === open) depth++;
      if (character === close && --depth < 0) return false;
    }
    return depth === 0;
  });
}

/** Reject provider outputs that contain only a token Korean fragment amid mostly untranslated text. */
export function isMarketRssTranslationKoreanEnough(text) {
  const translatedText = text.replace(/ZX\d+Q/g, "");
  const koreanLetters = [...translatedText.matchAll(/[가-힣]/g)].length;
  const allLetters = [...translatedText.matchAll(/\p{L}/gu)].length;
  return koreanLetters >= MIN_KOREAN_LETTERS
    && allLetters > 0
    && koreanLetters / allLetters >= MIN_KOREAN_LETTER_RATIO;
}

/** Conservative completeness heuristic, not a semantic-accuracy score. */
export function isMarketRssTranslationHeadlineComplete(sourceText, translatedText) {
  // A translation ending in an unclosed parenthetical/bracket is a common
  // provider truncation artifact (for example, a lost closing ticker suffix).
  if (!hasBalancedTitleDelimiters(translatedText)) return false;
  const sourceWords = sourceText
    .normalize("NFC")
    .replace(/ZX\d+Q/g, "")
    .match(/[\p{L}]+(?:['’][\p{L}]+)*/gu)
    ?.filter((word) => {
      return /\p{L}/u.test(word)
        && !/^[가-힣]+$/u.test(word)
        && !SOURCE_FUNCTION_WORDS.has(word.toLowerCase().replace(/[’']/g, ""));
    }) ?? [];
  const sourceContentLetters = sourceWords.reduce((total, word) => total + [...word].length, 0);
  const translatedContentWords = translatedText
    .replace(/ZX\d+Q/g, "")
    .match(/[가-힣]+/g) ?? [];
  const translatedSyllables = translatedContentWords.reduce((total, word) => total + [...word].length, 0);
  if (sourceWords.length === 0) return true;
  const unspacedSourceLetters = [...sourceText.normalize("NFC").replace(/ZX\d+Q/g, "").matchAll(/\p{L}/gu)].length;
  if (sourceWords.length === 1 && sourceContentLetters < 8) return true;
  const minimumSyllables = sourceWords.length <= 2 && sourceContentLetters < 16
    ? Math.min(4, Math.max(2, sourceContentLetters))
    : Math.min(6, Math.max(sourceWords.length, Math.ceil(unspacedSourceLetters / 4)));
  return translatedSyllables >= minimumSyllables;
}
