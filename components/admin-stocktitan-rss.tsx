"use client";

import { useEffect, useState } from "react";
import { Clipboard, Eye, RefreshCw } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import styles from "./admin-stocktitan-rss.module.css";

type Article = Record<string, unknown> & { id: number; title: string; summary: string; rawPayload?: string | null; translatedTitle?: string | null; translatedSummary?: string | null; link: string; publishedAt?: string | null; category: string; priority: number; notifyEligible: boolean; isBacklog: boolean; translationStatus: string; translationFallback: boolean; translationError?: string | null; notificationStatus: string; lastError?: string | null };

const json = (value: unknown) => JSON.stringify(value, null, 2);
function dateValue() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()); }

export function AdminStockTitanRss() {
  const [date, setDate] = useState(dateValue());
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/admin/stocktitan-rss?date=${encodeURIComponent(date)}`, { cache: "no-store" }); const value = await response.json(); if (!response.ok) throw new Error(value.error || "조회 실패"); setArticles(value.articles || []); }
    catch (e) { setError(e instanceof Error ? e.message : "조회 실패"); setArticles([]); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function copy(label: string, value: unknown) { await navigator.clipboard.writeText(typeof value === "string" ? value : json(value)); setCopied(label); window.setTimeout(() => setCopied(""), 1400); }

  return <section className={styles.container}>
    <div className={styles.toolbar}><div><strong>StockTitan 기사 디버깅</strong><p>한국시간 기준 날짜별 저장 결과입니다. 기사를 클릭하면 원본과 처리 결과 전체를 확인합니다.</p></div><div className={styles.actions}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /><button onClick={() => void load()} disabled={loading}><RefreshCw size={15} className={loading ? styles.spin : undefined} /> 조회</button></div></div>
    {error && <p className={styles.error}>{error}</p>}
    <div className={styles.stats}><span>{date} KST</span><span>기사 {articles.length}건</span><span>알림 대상 {articles.filter((a) => a.notifyEligible).length}건</span><span>번역 fallback {articles.filter((a) => a.translationFallback).length}건</span></div>
    {articles.length === 0 ? <p className={styles.empty}>해당 날짜에 저장된 StockTitan 기사가 없습니다.</p> : <div className={styles.list}>{articles.map((article) => <article className={styles.card} key={article.id}><div className={styles.cardTop}><span className={styles.badge}>{article.category}</span><span className={article.notifyEligible ? styles.eligible : styles.muted}>{article.notifyEligible ? "알림 대상" : "알림 제외"}</span></div><h2>{article.translatedTitle || article.title}</h2><p className={styles.original}>{article.title}</p><div className={styles.meta}><span>{article.publishedAt ? new Date(article.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "발행시각 없음"}</span><span>번역 {article.translationStatus}</span><span>전송 {article.notificationStatus}</span></div><button className={styles.detail} onClick={() => setSelected(article)}><Eye size={15} /> 전체 디버깅 보기</button></article>)}</div>}
    {selected && <AdminModal title={`StockTitan · ${selected.title}`} description="원문, 번역본, RSS 원시 항목, 필터 판정, 알림 상태와 JSON 전체를 확인합니다." onClose={() => setSelected(null)} wide><div className={styles.detailGrid}><section><h3>원문 제목</h3><pre>{selected.title}</pre><button onClick={() => void copy("title", selected.title)}><Clipboard size={14} /> {copied === "title" ? "복사됨" : "제목 복사"}</button><h3>원문 요약</h3><pre>{selected.summary || "(없음)"}</pre><button onClick={() => void copy("summary", selected.summary)}><Clipboard size={14} /> {copied === "summary" ? "복사됨" : "요약 복사"}</button><h3>RSS 원시 항목</h3><pre>{selected.rawPayload || "(저장된 원시 항목 없음)"}</pre><button onClick={() => void copy("raw", selected.rawPayload || "")}><Clipboard size={14} /> {copied === "raw" ? "복사됨" : "원시 항목 복사"}</button></section><section><h3>번역 제목</h3><pre>{selected.translatedTitle || "(번역 없음)"}</pre><button onClick={() => void copy("translated", selected.translatedTitle || "")}><Clipboard size={14} /> {copied === "translated" ? "복사됨" : "번역 제목 복사"}</button><h3>번역 요약</h3><pre>{selected.translatedSummary || "(번역 없음)"}</pre><button onClick={() => void copy("translatedSummary", selected.translatedSummary || "")}><Clipboard size={14} /> {copied === "translatedSummary" ? "복사됨" : "번역 요약 복사"}</button><h3>링크</h3><pre>{selected.link || "(없음)"}</pre></section></div><div className={styles.debugHeader}><h3>처리 결과 JSON</h3><button onClick={() => void copy("json", selected)}><Clipboard size={14} /> {copied === "json" ? "복사됨" : "전체 JSON 복사"}</button></div><pre className={styles.raw}>{json(selected)}</pre></AdminModal>}
  </section>;
}
