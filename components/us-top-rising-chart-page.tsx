"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";

type Item = { market: "NAS" | "AMS" | "NYS"; code: string; name?: string; rank?: number; changeRate?: number | null };

export function UsTopRisingChartPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [market, setMarket] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/stock/us/top-rising-chart", { cache: "no-store" }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body; }).then(body => setItems(body.items ?? [])).catch(error => setError(error instanceof Error ? error.message : "조회에 실패했습니다.")); }, []);
  const visible = useMemo(() => market === "ALL" ? items : items.filter(item => item.market === market), [items, market]);
  const current = selected == null ? null : visible[selected] ?? null;
  return <main className="page-shell"><section className="hero"><div className="kicker">US MARKET</div><h1>미국 상승률 TOP 100</h1><p>거래소별 상승률 상위 종목 중 활성 보통주만 표시합니다.</p></section><section className="panel"><div className="toolbar"><strong>보통주 {visible.length}종목</strong>{["ALL", "NAS", "AMS", "NYS"].map(value => <button key={value} type="button" onClick={() => setMarket(value)} aria-pressed={market === value}>{value === "ALL" ? "전체" : value}</button>)}</div>{error && <p role="alert">{error}</p>}{!error && !items.length && <p>실제 상승률 데이터를 불러오는 중입니다.</p>}<div className="grid">{visible.map((item, index) => <article className="card" key={`${item.market}:${item.code}`}><div><strong>{item.name || item.code}</strong><small>{item.code} · {item.market} · #{item.rank ?? index + 1}</small></div><b>{item.changeRate == null ? "-" : `${item.changeRate}%`}</b><button type="button" onClick={() => setSelected(index)}>차트 보기</button></article>)}</div></section>{current && <ChartModal code={`US:${current.code}`} company={current.name || current.code} position={{ current: (selected ?? 0) + 1, total: visible.length }} onClose={() => setSelected(null)} onPrevious={selected! > 0 ? () => setSelected(selected! - 1) : undefined} onNext={selected! < visible.length - 1 ? () => setSelected(selected! + 1) : undefined} prefetchCodes={visible.slice(Math.max(0, selected! - 1), selected! + 2).filter((_, index) => index !== 1).map(item => ({ code: `US:${item.code}`, company: item.name || item.code }))} />}</main>;
}
