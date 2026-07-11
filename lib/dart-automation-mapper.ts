import { calculateDartScore } from "./scoring";
import type { AlertItem, DartJudgment } from "./types";
import type { OpenDartListRow } from "./dart-opendart-client";

const DART_VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do";
const BULLISH_JUDGMENTS: DartJudgment[] = ["최강호재", "호재가능"];

export type DartAutomationCandidate = {
  receiptNo: string;
  receiptDate: string;
  company: string;
  title: string;
  judgment: DartJudgment;
  keywords: string[];
  link: string;
};

function buildViewerLink(receiptNo: string) {
  return `${DART_VIEWER_URL}?rcpNo=${encodeURIComponent(receiptNo)}`;
}

export function mapOpenDartRowsToCandidates(rows: OpenDartListRow[]): DartAutomationCandidate[] {
  const candidates = new Map<string, DartAutomationCandidate>();

  for (const row of rows) {
    const receiptNo = row.rcept_no?.trim();
    const title = row.report_nm?.trim();
    if (!receiptNo || !title) {
      continue;
    }

    const score = calculateDartScore(title);
    if (!BULLISH_JUDGMENTS.includes(score.judgment)) {
      continue;
    }

    candidates.set(receiptNo, {
      receiptNo,
      receiptDate: row.rcept_dt?.trim() || receiptNo.slice(0, 8),
      company: row.corp_name?.trim() || "회사명 확인 필요",
      title,
      judgment: score.judgment,
      keywords: score.keywords,
      link: buildViewerLink(receiptNo),
    });
  }

  return [...candidates.values()].sort((left, right) => right.receiptNo.localeCompare(left.receiptNo));
}

export function mapDartCandidateToAlert(candidate: DartAutomationCandidate, detectedAt: string): AlertItem {
  return {
    source: "DART",
    externalId: candidate.receiptNo,
    level: candidate.judgment,
    company: candidate.company,
    title: candidate.title,
    link: candidate.link,
    publishedAt: detectedAt,
    keywords: candidate.keywords,
  };
}
