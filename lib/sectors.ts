export type SectorType = "IT/반도체" | "바이오/제약" | "2차전지/에너지" | "금융/지주" | "엔터/게임" | "기타";

const SECTOR_KEYWORDS: Record<SectorType, string[]> = {
  "IT/반도체": ["삼성전자", "SK하이닉스", "반도체", "디스플레이", "칩", "소프트웨어", "IT", "HBM", "AI"],
  "바이오/제약": ["바이오", "제약", "생명과학", "임상", "신약", "메디", "헬스케어", "셀트리온", "HLB"],
  "2차전지/에너지": ["배터리", "2차전지", "리튬", "에너지", "태양광", "풍력", "양극재", "음극재", "LG에너지", "에코프로"],
  "금융/지주": ["은행", "금융", "보험", "증권", "지주", "홀딩스", "투자"],
  "엔터/게임": ["엔터", "게임", "콘텐츠", "영화", "드라마", "웹툰", "하이브", "SM", "JYP"],
  "기타": []
};

export function classifySector(company: string, title: string): SectorType {
  const text = `${company} ${title}`;
  
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (sector === "기타") continue;
    if (keywords.some(keyword => text.includes(keyword))) {
      return sector as SectorType;
    }
  }
  
  return "기타";
}

export function getSectorSentiment(items: { company: string; title: string; judgment?: string; sentiment?: string }[]) {
  const sectorCounts: Record<SectorType, { count: number; bullish: number }> = {
    "IT/반도체": { count: 0, bullish: 0 },
    "바이오/제약": { count: 0, bullish: 0 },
    "2차전지/에너지": { count: 0, bullish: 0 },
    "금융/지주": { count: 0, bullish: 0 },
    "엔터/게임": { count: 0, bullish: 0 },
    "기타": { count: 0, bullish: 0 },
  };

  items.forEach(item => {
    const sector = classifySector(item.company, item.title);
    const isBullish = item.judgment === "최강호재" || item.sentiment === "호재가능";
    
    sectorCounts[sector].count++;
    if (isBullish) {
      sectorCounts[sector].bullish++;
    }
  });

  return Object.entries(sectorCounts).map(([name, stats]) => ({
    name,
    strength: stats.count > 0 ? (stats.bullish / stats.count) * 100 : 0,
    count: stats.count
  }));
}
