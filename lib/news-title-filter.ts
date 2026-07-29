const POSITIVE = [
  { words: ["fda", "승인", "허가", "clearance"], score: 5 },
  { words: ["임상", "clinical", "phase 3", "phase iii", "endpoint"], score: 4 },
  { words: ["계약", "수주", "contract", "agreement", "purchase order"], score: 4 },
  { words: ["인수", "합병", "merger", "acquisition", "m&a"], score: 4 },
  { words: ["파트너십", "partnership", "collaboration", "license"], score: 3 },
  { words: ["실적 개선", "guidance raised", "raises guidance", "record revenue"], score: 3 },
];
const NEGATIVE = ["희석", "공모", "atm", "전환사채", "convertible", "offering", "bankruptcy", "파산", "상장폐지", "delist", "소송", "lawsuit", "going concern"];

export function normalizeNewsTitle(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}]+/gu, " ").replace(/\s+/g, " ").trim();
}

export function scoreNewsTitle(title: string) {
  const normalized = normalizeNewsTitle(title);
  const positiveMatches = POSITIVE.filter((group) => group.words.some((word) => normalized.includes(normalizeNewsTitle(word))));
  const negativeMatches = NEGATIVE.filter((word) => normalized.includes(normalizeNewsTitle(word)));
  const positiveScore = positiveMatches.reduce((sum, group) => sum + group.score, 0);
  const negativeScore = negativeMatches.length * 5;
  return { normalized, positiveScore, negativeScore, score: positiveScore - negativeScore, positiveMatches: positiveMatches.flatMap((group) => group.words), negativeMatches, eligible: positiveScore - negativeScore >= 3 && negativeMatches.length === 0 };
}
