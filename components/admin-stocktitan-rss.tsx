"use client";

import { useEffect, useState } from "react";
import { Clipboard, Eye, RefreshCw } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import {
  MARKET_RSS_GRADE_LABELS,
  type MarketRssGrade,
} from "@/lib/market-rss-grade";
import {
  MARKET_RSS_SOURCES,
  type MarketRssSource,
} from "@/lib/market-rss-sources";
import styles from "./admin-stocktitan-rss.module.css";

type GradeFilter = "all" | MarketRssGrade;

type Article = Record<string, unknown> & {
  id: number;
  source?: string;
  title: string;
  summary: string;
  rawPayload?: string | null;
  translatedTitle?: string | null;
  translatedSummary?: string | null;
  detectedTicker?: string | null;
  eventDirection?: string;
  financingAmountUsd?: number | null;
  dilutionRisk?: string | null;
  link: string;
  publishedAt?: string | null;
  category: string;
  priority: number;
  notifyEligible: boolean;
  isBacklog: boolean;
  translationStatus: string;
  translationFallback: boolean;
  translationError?: string | null;
  notificationStatus: string;
  lastError?: string | null;
  grade: MarketRssGrade;
};

const SOURCE_LABELS: Record<MarketRssSource, string> = {
  GLOBENEWSWIRE: "GlobeNewswire",
  NASDAQ: "NASDAQ",
  NASDAQ_TRADER: "NASDAQ Trader",
  SEC_EDGAR: "SEC EDGAR",
  STOCKTITAN: "StockTitan",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);

function dateValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function AdminStockTitanRss() {
  const [date, setDate] = useState(dateValue());
  const [source, setSource] = useState<MarketRssSource>("STOCKTITAN");
  const [grade, setGrade] = useState<GradeFilter>("all");
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        date,
        source,
        grade,
      });
      const response = await fetch(`/api/admin/stocktitan-rss?${query.toString()}`, {
        cache: "no-store",
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "조회 실패");
      setArticles(value.articles || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "조회 실패");
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function copy(label: string, value: unknown) {
    await navigator.clipboard.writeText(typeof value === "string" ? value : json(value));
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1400);
  }

  const gradeLabel = (value: MarketRssGrade) => MARKET_RSS_GRADE_LABELS[value];

  return (
    <section className={styles.container}>
      <div className={styles.toolbar}>
        <div>
          <strong>RSS 공시 등급 조회</strong>
          <p>출처·한국시간 날짜·호재 등급으로 저장된 RSS 공시를 좁혀 보고, 기사별 원문과 처리 상태를 확인합니다.</p>
        </div>
        <div className={styles.actions}>
          <select value={source} onChange={(e) => setSource(e.target.value as MarketRssSource)} aria-label="RSS 출처">
            {MARKET_RSS_SOURCES.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
          </select>
          <select value={grade} onChange={(e) => setGrade(e.target.value as GradeFilter)} aria-label="호재 등급">
            <option value="all">전체 등급</option>
            {(Object.keys(MARKET_RSS_GRADE_LABELS) as MarketRssGrade[]).map((value) => <option key={value} value={value}>{gradeLabel(value)}</option>)}
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? styles.spin : undefined} /> 조회
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.stats}>
        <span>{SOURCE_LABELS[source]}</span>
        <span>{date} KST</span>
        <span>{grade === "all" ? "전체 등급" : gradeLabel(grade)} </span>
        <span>기사 {articles.length}건</span>
        <span>알림 대상 {articles.filter((article) => article.notifyEligible).length}건</span>
        <span>번역 fallback {articles.filter((article) => article.translationFallback).length}건</span>
      </div>

      {articles.length === 0 ? (
        <p className={styles.empty}>선택한 출처·날짜·등급에 해당하는 RSS 공시가 없습니다.</p>
      ) : (
        <div className={styles.list}>
          {articles.map((article) => (
            <article className={styles.card} key={article.id}>
              <div className={styles.cardTop}>
                <span className={styles.badge}>{gradeLabel(article.grade)} · {article.category} · P{article.priority}</span>
                <span className={article.notifyEligible ? styles.eligible : styles.muted}>
                  {article.notifyEligible ? "알림 대상" : "알림 제외"}
                </span>
              </div>
              <h2>{article.translatedTitle || article.title}</h2>
              <p className={styles.original}>{article.title}</p>
              <div className={styles.meta}>
                <span>{article.detectedTicker ? `티커 ${article.detectedTicker}` : "티커 미추출"}</span>
                <span>{article.eventDirection || "NEUTRAL"}{article.financingAmountUsd ? ` · $${article.financingAmountUsd.toLocaleString()}` : ""}</span>
                <span>번역 {article.translationStatus}</span>
                <span>전송 {article.notificationStatus}</span>
              </div>
              <button className={styles.detail} onClick={() => setSelected(article)}>
                <Eye size={15} /> 전체 디버깅 보기
              </button>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <AdminModal
          title={`${selected.source || SOURCE_LABELS[source]} · ${selected.title}`}
          description={`호재 등급: ${gradeLabel(selected.grade)} · priority ${selected.priority} · 알림 대상 ${selected.notifyEligible ? "예" : "아니오"}. 원문, 번역본, RSS 원시 항목, 필터 판정, 알림 상태와 JSON 전체를 확인합니다.`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className={styles.detailGrid}>
            <section>
              <h3>원문 제목</h3>
              <pre>{selected.title}</pre>
              <button onClick={() => void copy("title", selected.title)}><Clipboard size={14} /> {copied === "title" ? "복사됨" : "제목 복사"}</button>
              <h3>원문 요약</h3>
              <pre>{selected.summary || "(없음)"}</pre>
              <button onClick={() => void copy("summary", selected.summary)}><Clipboard size={14} /> {copied === "summary" ? "복사됨" : "요약 복사"}</button>
              <h3>RSS 원시 항목</h3>
              <pre>{selected.rawPayload || "(저장된 원시 항목 없음)"}</pre>
              <button onClick={() => void copy("raw", selected.rawPayload || "")}><Clipboard size={14} /> {copied === "raw" ? "복사됨" : "원시 항목 복사"}</button>
            </section>
            <section>
              <h3>번역 제목</h3>
              <pre>{selected.translatedTitle || "(번역 없음)"}</pre>
              <button onClick={() => void copy("translated", selected.translatedTitle || "")}><Clipboard size={14} /> {copied === "translated" ? "복사됨" : "번역 제목 복사"}</button>
              <h3>번역 요약</h3>
              <pre>{selected.translatedSummary || "(번역 없음)"}</pre>
              <button onClick={() => void copy("translatedSummary", selected.translatedSummary || "")}><Clipboard size={14} /> {copied === "translatedSummary" ? "복사됨" : "번역 요약 복사"}</button>
              <h3>링크</h3>
              <pre>{selected.link || "(없음)"}</pre>
            </section>
          </div>
          <div className={styles.debugHeader}>
            <h3>처리 결과 JSON</h3>
            <button onClick={() => void copy("json", selected)}><Clipboard size={14} /> {copied === "json" ? "복사됨" : "전체 JSON 복사"}</button>
          </div>
          <pre className={styles.raw}>{json(selected)}</pre>
        </AdminModal>
      )}
    </section>
  );
}
