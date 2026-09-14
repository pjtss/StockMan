"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "./us-top-rising-chart-page.module.css";

type Item = { market: "KOSPI" | "KOSDAQ"; code: string; name?: string; rank?: number; rate?: number; volume?: number; tradingValue?: number };

export function KrTopRisingChartPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const response = await fetch("/api/stock/kr/top-rising-chart", { cache: "no-store" }); const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); setItems(body.items ?? []); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const current = selected == null ? null : items[selected] ?? null;
  return <main className={styles.page}><section className={styles.hero}><div className={styles.eyebrow}>KR MARKET · MEMORY UNIVERSE</div><div className={styles.heroRow}><div><h1>국내 상승률 <span>TOP 100</span></h1><p>장중 메모리에 보관된 KOSPI·KOSDAQ 상승률 후보를 차트로 확인합니다.</p></div><button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>{loading ? "조회 중…" : "↻ 메모리 갱신"}</button></div><div className={styles.stats}><span><b>{items.length}</b> 전체 종목</span><span>데이터 소스 <b>MEMORY</b></span></div></section><section className={styles.panel}><div className={styles.toolbar}><div><strong>상승률 랭킹</strong><small>메모리 TOP100 · 거래소별 원천 순위</small></div></div>{error && <div className={styles.stateError} role="alert">{error}<button type="button" onClick={() => void load()}>다시 시도</button></div>}{loading && !items.length && <div className={styles.state}>메모리 스냅샷을 불러오는 중입니다.</div>}{!loading && !error && !items.length && <div className={styles.state}>현재 메모리에 국내 상승률 데이터가 없습니다.</div>}<div className={styles.grid}>{items.map((item, index) => <article className={styles.card} key={`${item.market}:${item.code}`}><div className={styles.rank}>#{String(item.rank ?? index + 1).padStart(2, "0")}</div><div className={styles.identity}><strong title={item.name || item.code}>{item.name || "회사명 확인 중"}</strong><small>{item.code} <i>·</i> {item.market}</small></div><div className={styles.change}><b>{item.rate == null ? "-" : `${item.rate > 0 ? "+" : ""}${item.rate}%`}</b><small>상승률</small></div><button className={styles.chartButton} type="button" onClick={() => setSelected(index)}>차트 보기 <span>→</span></button></article>)}</div></section>{current && <ChartModal code={current.code} company={current.name || current.code} exchange={current.market} position={{ current: selected! + 1, total: items.length }} onClose={() => setSelected(null)} onPrevious={selected! > 0 ? () => setSelected(selected! - 1) : undefined} onNext={selected! < items.length - 1 ? () => setSelected(selected! + 1) : undefined} prefetchCodes={items.slice(Math.max(0, selected! - 1), selected! + 2).filter((_, index) => index !== 1).map(item => ({ code: item.code, company: item.name || item.code }))} />}</main>;
}
