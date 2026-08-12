"use client";

import { FormEvent, useState } from "react";
import styles from "./us-news-lookup.module.css";

type Item = { newsKey: string; date: string; time: string; title: string; source: string; name: string };
type Result = { ok: boolean; ticker?: string; fromDate?: string; toDate?: string; items?: Item[]; error?: string };

const PERIODS = [{ value: "today", label: "오늘" }, { value: "3d", label: "최근 3일" }, { value: "7d", label: "최근 7일" }, { value: "1m", label: "최근 1개월" }];

export function UsNewsLookup() {
  const [ticker, setTicker] = useState("");
  const [period, setPeriod] = useState("today");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/stock/us/news?ticker=${encodeURIComponent(ticker)}&period=${period}`, { cache: "no-store" });
      setResult(await response.json());
    } catch (error) { setResult({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    finally { setLoading(false); }
  }

  return <main className={styles.page}>
    <p className={styles.kicker}>KIS OVERSEAS NEWS</p>
    <h1>미국 종목 뉴스 조회</h1>
    <p className={styles.description}>KIS 해외주식 뉴스 제목 API에서 티커별 최신 공시·속보를 기간별로 조회합니다. 기준일은 미국 동부 시장일입니다.</p>
    <form className={styles.form} onSubmit={submit}>
      <input aria-label="티커" value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="티커 입력 (예: AAPL)" maxLength={15} />
      <select aria-label="조회 기간" value={period} onChange={(event) => setPeriod(event.target.value)}>{PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      <button type="submit" disabled={loading}>{loading ? "조회 중…" : "조회"}</button>
    </form>
    {result && (result.ok ? <section className={styles.result}>
      <div className={styles.meta}><strong>{result.ticker}</strong><span>{result.fromDate} ~ {result.toDate}</span><span>{result.items?.length || 0}건</span></div>
      {result.items?.length ? <ul>{result.items.map((item) => <li key={item.newsKey}><time>{item.date} {item.time}</time><div><strong>{item.title}</strong><small>{item.source}{item.name ? ` · ${item.name}` : ""}</small></div></li>)}</ul> : <p className={styles.empty}>해당 기간에 조회된 뉴스가 없습니다.</p>}
    </section> : <p className={styles.error}>{result.error || "조회에 실패했습니다."}</p>)}
  </main>;
}
