"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./intraday-detection-page.module.css";

type Criteria = { windowMinutes: number; requiredSamples: number; minTurnoverToMarketCapPercent: number; bucketMinutes: number; retainedTurnoverMinutes?: number };
type TurnoverWindow = { minutes: number; tradingValue: number | null; turnoverRatio: number | null; sampleCount: number; requiredSamples: number; complete: boolean };
type Item = { market: string; code: string; marketCap: number; rollingTradingValue: number; rollingTurnoverRatio: number; sampleCount: number; state: string; windowStart: number | null; windowEnd: number | null; lastObservedAt: string | null; turnoverWindows?: TurnoverWindow[] };
type UsFocusItem = { market: string; code: string; name: string; rank: number | null; currency: "USD"; status: string; state: string; turnoverWindows: TurnoverWindow[]; lastObservedAt: string | null };
type Body = { criteria?: Criteria; status?: { worker?: { status?: string; lastTickAt?: number | null; lastError?: string | null }; reason?: string; top100CandidateCount?: number; trackedCandidateCount?: number; usFocusPoolCount?: number; qualifiedCandidateCount?: number; message?: string }; items?: Item[]; usFocusItems?: UsFocusItem[]; collectedAt?: string };

function formatNumber(value: number, fraction = 2) { return Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: fraction }) : "-"; }
function formatUsd(value: number | null) { return value == null || !Number.isFinite(value) ? "미수집" : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`; }
function formatTime(value: string | number | null | undefined) { if (!value) return "-"; const date = new Date(typeof value === "number" ? value : value); return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

export function IntradayDetectionPage() {
  const [body, setBody] = useState<Body | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/kis/intraday-mvp?ts=${Date.now()}`, { cache: "no-store" });
      const next = await response.json().catch(() => null);
      if (!response.ok || !next?.ok) throw new Error(next?.message ?? `HTTP ${response.status}`);
      setBody(next); setError(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "탐지 후보를 불러오지 못했습니다."); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 15000); return () => window.clearInterval(timer); }, [load]);
  const status = body?.status;
  const items = body?.items ?? [];
  const usFocusItems = body?.usFocusItems ?? [];
  const criteria = body?.criteria;
  return <section className={styles.panel} aria-live="polite">
    <div className={styles.toolbar}>
      <div><strong>현재 최종 후보</strong><small>{status?.message ?? "실시간 탐지 상태를 확인하는 중입니다."}</small></div>
      <button type="button" className={styles.refresh} onClick={() => void load()} disabled={loading}>{loading ? "조회 중…" : "새로고침"}</button>
    </div>
    <div className={styles.stats}>
      <span>워커 <b className={status?.worker?.status === "RUNNING" ? styles.good : ""}>{status?.worker?.status ?? "-"}</b></span>
      <span>TOP100 후보 <b>{status?.top100CandidateCount ?? 0}</b></span>
      <span>관측 중 <b>{status?.trackedCandidateCount ?? 0}</b></span>
      <span>최종 후보 <b>{status?.qualifiedCandidateCount ?? items.length}</b></span>
      {criteria && <span>조건 <b>{criteria.windowMinutes}분 · 시총 대비 {criteria.minTurnoverToMarketCapPercent}%</b></span>}
      <span>최근 갱신 <b>{formatTime(body?.collectedAt)}</b></span>
    </div>
    {error ? <div className={styles.error}><strong>조회 실패</strong><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : items.length === 0 ? <div className={styles.empty}><strong>{loading ? "최신 탐지 상태를 불러오는 중입니다." : "현재 최종 탐지 후보가 없습니다."}</strong><span>필터 통과 종목을 계속 관측하며 조건 충족 시 이 화면에 표시합니다. 자동으로 15초마다 갱신됩니다.</span></div> : <div className={styles.list}>{items.map(item => <article className={styles.card} key={`${item.market}-${item.code}`}><div className={styles.identity}><span>{item.market}</span><strong>{item.code}</strong></div><div className={styles.metric}><small>{criteria?.windowMinutes ?? 5}분 누적 시총 대비 거래대금</small><b>{formatNumber(item.rollingTurnoverRatio * 100)}%</b></div><div className={styles.metric}><small>누적 거래대금</small><b>{formatNumber(item.rollingTradingValue)}</b></div><div className={styles.meta}><span>샘플 {item.sampleCount}개</span><span>{item.state}</span><span>{formatTime(item.lastObservedAt)}</span></div><Link className={styles.chart} href={`/charts?code=${encodeURIComponent(item.code)}&market=${encodeURIComponent(item.market)}`}>차트 보기</Link></article>)}</div>}
    {usFocusItems.length > 0 && <section className={styles.turnoverSection} aria-label="미국 집중 관측 종목의 최근 1~10분 거래대금">
      <div className={styles.turnoverHeading}><div><strong>미국 TOP100 집중 관측 · 최근 거래대금</strong><span>우선순위 집중 관측 풀 {status?.usFocusPoolCount ?? usFocusItems.length}종목 · 메모리 최대 {criteria?.retainedTurnoverMinutes ?? 10}분 · USD</span></div></div>
      <p className={styles.turnoverNote}>KIS 호출 예산을 지키기 위해 미국 전체 TOP100이 아니라 거래소 통합 우선순위 상위 집중 관측 종목의 분봉만 조회합니다. 각 구간은 해당 시간만큼 연속된 1분 데이터가 충분히 모여야 확정 금액을 표시합니다.</p>
      <div className={styles.turnoverTableScroll}><table className={styles.turnoverTable}><thead><tr><th scope="col">종목</th>{Array.from({ length: 10 }, (_, index) => <th scope="col" key={index}>{index + 1}분</th>)}</tr></thead><tbody>{usFocusItems.map((item) => <tr key={`${item.market}:${item.code}`}><th scope="row"><span>{item.market} · #{item.rank ?? "-"}</span><strong>{item.name}</strong><small>{item.code} · {item.state} · {formatTime(item.lastObservedAt)}</small></th>{item.turnoverWindows.map((window) => <td key={window.minutes} title={`${window.sampleCount}/${window.requiredSamples} 연속 분봉${window.complete && window.turnoverRatio != null ? ` · 시총 대비 ${(window.turnoverRatio * 100).toFixed(3)}%` : ""}`}><strong>{formatUsd(window.tradingValue)}</strong><small>{window.complete ? window.turnoverRatio == null ? "시총 없음" : `${(window.turnoverRatio * 100).toFixed(2)}%` : `${window.sampleCount}/${window.requiredSamples}봉`}</small></td>)}</tr>)}</tbody></table></div>
    </section>}
    {status?.worker?.lastError && <p className={styles.warning}>워커 최근 오류: {status.worker.lastError}</p>}
  </section>;
}
