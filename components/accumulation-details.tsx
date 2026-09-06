"use client";

import { useState } from "react";
import type { AccumulationResult, AccumulationReport } from "@/lib/accumulation-scan";

const formatTime = (value: string | null) => value
  ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false }) + " KST"
  : "원본 미제공";
export function AccumulationSummary({ report }: { report: AccumulationReport }) {
  return <div aria-label="매집 탐지 요약">
    <p>{report.region === "KR" ? "국내" : "해외"} · v{report.logicVersion} · 대상 {report.summary.eligible}개 · 계산 {report.summary.evaluated}개 · 통과 {report.summary.matched}개 · 표시 {report.count}개</p>
    <p>{report.criteria}</p>
    <p>유효 캐시 거래일: {Object.entries(report.cache.latestDateByMarket).map(([m, d]) => m + " " + d).join(" / ") || "없음"} · 검사: {formatTime(report.checkedAt)}</p>
    {report.summary.truncated && <p>표시 한도 때문에 전체 통과 종목 중 일부만 표시합니다.</p>}
    <details><summary>제외 사유·데이터 한계</summary>
      <p>{Object.entries(report.summary.exclusions).map(([reason, count]) => reason + ": " + count).join(" / ") || "제외 없음"}</p>
      <ul>{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>
    </details>
  </div>;
}
export function AccumulationDetails({ row }: { row: AccumulationResult }) {
  const [showCandles, setShowCandles] = useState(false);
  return <div style={{ overflowWrap: "anywhere" }}>
    <p>매집 의심 점수 {row.score}/100 · v{row.logicVersion}</p>
    <p>일봉 거래일 {row.candleDate} · 갱신 {formatTime(row.candleFetchedAt)}</p>
    <details><summary>점수 근거</summary>
      <ul>{row.scoreBreakdown.map(reason => <li key={reason.code}>
        {reason.label}: {reason.points}점 ({reason.possiblePoints < 0 ? "최대 감점 " : "배점 "}{Math.abs(reason.possiblePoints)})
      </li>)}</ul>
    </details>
    <details onToggle={event => setShowCandles(event.currentTarget.open)}>
      <summary>사용 일봉 {row.timeframeMeta.daily.usedCandles.length}개 · 거래일/갱신시각</summary>
      {showCandles && <ul>{row.timeframeMeta.daily.usedCandles.map(candle => <li key={candle.date}>
        {row.name} ({row.code}) · {candle.date} · 거래시각 {formatTime(candle.tradingAt)} · 갱신 {formatTime(candle.updatedAt)}
      </li>)}</ul>}
    </details>
  </div>;
}
