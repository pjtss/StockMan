"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "./us-top-rising-chart-page.module.css";

type Item = { market: "NAS" | "AMS" | "NYS"; code: string; name?: string; rank?: number; changeRate?: number | null; priority?: number; turnoverToMarketCap?: number; priorityReasons?: string[] };

export function UsTopRisingChartPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [market, setMarket] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null); setNotice(null);
    try {
      const response = await fetch("/api/stock/us/top-rising-chart", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
      setItems(body.items ?? []); setCollectedAt(body.collectedAt ?? null); setNotice(body.items?.length ? null : body.message ?? "현재 조회 가능한 상승률 데이터가 없습니다.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => market === "ALL" ? items : items.filter(item => item.market === market), [items, market]);
  const current = selected == null ? null : visible[selected] ?? null;
  const focusCandidates = useMemo(() => visible.filter((item) => (item.priority ?? 0) > 0).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)).slice(0, 20), [visible]);
 return <main className={styles.page}><section className={styles.hero}><div className={styles.eyebrow}>US MARKET · LIVE UNIVERSE</div><div className={styles.heroRow}><div><h1>미국 상승률 <span>TOP 100</span></h1><p>거래소별 상승률 상위 종목 중 활성 보통주만 선별해 차트로 확인합니다.</p></div><button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>{loading ? "갱신 중…" : "↻ 데이터 갱신"}</button></div><div className={styles.stats}><span><b>{items.length}</b> 전체 종목</span><span><b>{visible.length}</b> 현재 보기</span><span><b>{focusCandidates.length}</b> 집중 탐지 후보</span><span>마지막 갱신 <b>{collectedAt ? new Date(collectedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "-"}</b></span></div></section>{focusCandidates.length > 0 && <section className={styles.panel}><div className={styles.toolbar}><div><strong>집중 탐지 후보</strong><small>거래대금/시가총액 비율과 변동 신호 기준 우선순위</small></div></div><div className={styles.grid}>{focusCandidates.map((item) => <article className={styles.card} key={`focus:${item.market}:${item.code}`}><div className={styles.rank}>P{item.priority}</div><div className={styles.identity}><strong title={item.name || item.code}>{item.name || "회사명 확인 중"}</strong><small>{item.code} <i>·</i> {item.market}</small></div><div className={styles.change}><b>{item.turnoverToMarketCap == null ? "-" : `${(item.turnoverToMarketCap * 100).toFixed(2)}%`}</b><small>거래대금/시총</small></div><button className={styles.chartButton} type="button" onClick={() => setSelected(visible.findIndex((candidate) => candidate.code === item.code && candidate.market === item.market))}>차트 보기 <span>→</span></button></article>)}</div></section>}<section className={styles.panel}><div className={styles.toolbar}><div><strong>상승률 랭킹</strong><small>원천 순위 · 등락률 내림차순</small></div><div className={styles.filters} role="group" aria-label="거래소 필터">{["ALL", "NAS", "AMS", "NYS"].map(value => <button className={market === value ? styles.activeFilter : ""} key={value} type="button" onClick={() => { setMarket(value); setSelected(null); }} aria-pressed={market === value}>{value === "ALL" ? "전체" : value}</button>)}</div></div>{error && <div className={styles.stateError} role="alert"><strong>데이터를 불러오지 못했습니다.</strong><span>{error}</span><button type="button" onClick={() => void load()}>다시 시도</button></div>}{loading && !items.length && <div className={styles.state}><span className={styles.spinner} />실제 상승률 데이터를 불러오는 중입니다.</div>}{!loading && !error && !items.length && <div className={styles.state}>현재 표시할 실제 상승률 데이터가 없습니다.</div>}<div className={styles.grid}>{visible.map((item, index) => <article className={styles.card} key={`${item.market}:${item.code}`}><div className={styles.rank}>#{String(item.rank ?? index + 1).padStart(2, "0")}</div><div className={styles.identity}><strong title={item.name || item.code}>{item.name || "회사명 확인 중"}</strong><small>{item.code} <i>·</i> {item.market}</small></div><div className={styles.change}><b>{item.changeRate == null ? "-" : `${item.changeRate > 0 ? "+" : ""}${item.changeRate}%`}</b><small>상승률</small></div><button className={styles.chartButton} type="button" onClick={() => setSelected(index)}>차트 보기 <span>→</span></button></article>)}</div></section>{current && <ChartModal code={`US:${current.code}`} company={current.name || current.code} exchange={current.market} position={{ current: (selected ?? 0) + 1, total: visible.length }} onClose={() => setSelected(null)} onPrevious={selected! > 0 ? () => setSelected(selected! - 1) : undefined} onNext={selected! < visible.length - 1 ? () => setSelected(selected! + 1) : undefined} prefetchCodes={visible.slice(Math.max(0, selected! - 1), selected! + 2).filter((_, index) => index !== 1).map(item => ({ code: `US:${item.code}`, company: item.name || item.code }))} />}</main>;
}
