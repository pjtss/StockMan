import type { DartJudgment } from "./types";

interface KeywordScore {
  pattern: string | RegExp;
  score: number;
  label?: string;
  isExclusion?: boolean; // If true, finding this might cancel out other scores or act as a negative filter
}

const DART_SCORING_RULES: KeywordScore[] = [
  // 강력한 호재 (+10 이상)
  { pattern: /제3자\s*배정\s*유상증자/, score: 15, label: "제3자배정" },
  { pattern: /단일판매\s*[·ㆍ]?\s*공급계약체결/, score: 12, label: "공급계약" },
  { pattern: /대규모\s*수주/, score: 12, label: "대규모수주" },
  { pattern: /흑자전환/, score: 10, label: "흑자전환" },
  { pattern: /영업이익\s*증가/, score: 8, label: "실적개선" },
  { pattern: /자기주식\s*취득결정/, score: 10, label: "자사주매입" },
  { pattern: /무상증자결정/, score: 10, label: "무상증자" },
  { pattern: /특허권\s*취득/, score: 7, label: "특허" },
  
  // 일반 호재 (+5 ~ +9)
  { pattern: /잠정\s*실적/, score: 5, label: "잠정실적" },
  { pattern: /현금\s*[·ㆍ]?\s*현물배당결정/, score: 6, label: "배당" },
  { pattern: /투자판단관련\s*주요경영사항/, score: 5, label: "주요공시" },
  
  // 감점 및 예외 사항
  { pattern: /\[\s*정정\s*\]/, score: -3, label: "정정" },
  { pattern: /해지/, score: -15, isExclusion: true },
  { pattern: /철회/, score: -15, isExclusion: true },
  { pattern: /중단/, score: -10, isExclusion: true },
  
  // 악재 (음수)
  { pattern: /영업정지/, score: -15, label: "영업정지" },
  { pattern: /불성실\s*공시/, score: -12, label: "불성실" },
  { pattern: /회생절차/, score: -20, label: "회생" },
  { pattern: /감자\s*결정/, score: -15, label: "감자" },
  { pattern: /소송/, score: -8, label: "소송" },
];

export function calculateDartScore(title: string): { score: number; keywords: string[]; judgment: DartJudgment } {
  let totalScore = 0;
  const matchedKeywords: string[] = [];
  let hasExclusion = false;

  for (const rule of DART_SCORING_RULES) {
    const isMatched = typeof rule.pattern === "string" 
      ? title.includes(rule.pattern) 
      : rule.pattern.test(title);

    if (isMatched) {
      totalScore += rule.score;
      if (rule.label) {
        matchedKeywords.push(rule.label);
      }
      if (rule.isExclusion) {
        hasExclusion = true;
      }
    }
  }

  // 강제 제외 처리 (해지, 철회 등 발견 시 악재로 고정)
  if (hasExclusion) {
    return { score: -20, keywords: matchedKeywords, judgment: "악재" };
  }

  let judgment: DartJudgment = "중립";
  if (totalScore >= 12) {
    judgment = "최강호재";
  } else if (totalScore >= 5) {
    judgment = "호재가능";
  } else if (totalScore <= -8) {
    judgment = "악재";
  }

  return { score: totalScore, keywords: matchedKeywords, judgment };
}
