"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import styles from "./intraday-detection-page.module.css";

type Criteria = { windowMinutes: number; requiredSamples: number; minTurnoverToMarketCapPercent: number; bucketMinutes: number };
type Item = { market: string; code: string; marketCap: number; rollingTradingValue: number; rollingTurnoverRatio: number; sampleCount: number; state: string; windowStart: string | null; windowEnd: string | null; lastObservedAt: string | null };
type Body = { criteria?: Criteria; status?: { worker?: { status?: string; lastTickAt?: number | null; lastError?: string | null }; reason?: string; top100CandidateCount?: number; trackedCandidateCount?: number; qualifiedCandidateCount?: number; message?: string }; items?: Item[]; collectedAt?: string };

function formatNumber(value: number, fraction = 2) { return Number.isFinite(value) ? value.toLocaleString("ko-KR", { maximumFractionDigits: fraction }) : "-"; }
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
    {error ? <div className={styles.error}><strong>조회 실패</strong><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div> : items.length === 0 ? <div className={styles.empty}><strong>{loading ? "최신 탐지 상태를 불러오는 중입니다." : "현재 최종 탐지 후보가 없습니다."}</strong><span>필터 통과 종목을 계속 관측하며 조건 충족 시 이 화면에 표시합니다. 자동으로 15초마다 갱신됩니다.</span></div> : <div className={styles.list}>{items.map(item => <article className={styles.card} key={`${item.market}-${item.code}`}><div className={styles.identity}><span>{item.market}</span><strong>{item.code}</strong></div><div className={styles.metric}><small>5분 누적 시총 대비 거래대금</small><b>{formatNumber(item.rollingTurnoverRatio * 100)}%</b></div><div className={styles.metric}><small>누적 거래대금</small><b>{formatNumber(item.rollingTradingValue)}</b></div><div className={styles.meta}><span>샘플 {item.sampleCount}개</span><span>{item.state}</span><span>{formatTime(item.lastObservedAt)}</span></div><Link className={styles.chart} href={`/charts?code=${encodeURIComponent(item.code)}&market=${encodeURIComponent(item.market)}`}>차트 보기</Link></article>)}</div>}
    {status?.worker?.lastError && <p className={styles.warning}>워커 최근 오류: {status.worker.lastError}</p>}
  </section>;
}
