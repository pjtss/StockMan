"use client";

import { Clipboard, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./admin-daily-rss-export.module.css";

type CopyItem = { title: string; link: string; grade: string };
type ExportResponse = {
  ok: boolean;
  date?: string;
  timezone?: string;
  fields?: readonly string[];
  count?: number;
  duplicateCount?: number;
  sourceCounts?: Record<string, number>;
  gradeCounts?: Record<string, number>;
  items?: CopyItem[];
  error?: string;
};

function todayKst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function AdminDailyRssExport() {
  const [date, setDate] = useState(todayKst());
  const [response, setResponse] = useState<ExportResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const items = response?.items || [];
  const copiedJson = useMemo(() => JSON.stringify(items, null, 2), [items]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await fetch(`/api/admin/daily-rss?date=${encodeURIComponent(date)}`, { cache: "no-store" });
      const value = await result.json() as ExportResponse;
      if (!result.ok || !value.ok) throw new Error(value.error || `HTTP ${result.status}`);
      setResponse(value);
    } catch (requestError) {
      setResponse(null);
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function copyItems() {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(copiedJson);
        } catch {
          const textarea = document.createElement("textarea");
          textarea.value = copiedJson;
          textarea.setAttribute("readonly", "");
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          const copiedWithFallback = document.execCommand("copy");
          textarea.remove();
          if (!copiedWithFallback) throw new Error("document.execCommand copy failed");
        }
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = copiedJson;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copiedWithFallback = document.execCommand("copy");
        textarea.remove();
        if (!copiedWithFallback) throw new Error("document.execCommand copy failed");
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? `복사 실패: ${copyError.message}` : "복사 실패");
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.toolbar}>
        <div>
          <strong>일별 해외 RSS · SEC 복사</strong>
          <p>선택한 KST 날짜의 RSS·SEC 공시에서 제목, 링크, 호재 등급만 추려 복사합니다.</p>
        </div>
        <div className={styles.actions}>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label="조회 날짜" />
          <button onClick={() => void load()} disabled={loading} type="button"><RefreshCw size={15} className={loading ? styles.spin : undefined} /> 조회</button>
          <button onClick={() => void copyItems()} disabled={!response || loading} type="button"><Clipboard size={15} /> {copied ? "복사됨" : "3개 필드 JSON 복사"}</button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {response && <>
        <div className={styles.stats}>
          <span>{response.date} {response.timezone}</span>
          <span>총 {response.count ?? items.length}건</span>
          <span>중복 제거 {response.duplicateCount ?? 0}건</span>
          {Object.entries(response.sourceCounts || {}).map(([source, count]) => <span key={source}>{source} {count}건</span>)}
        </div>
        <div className={styles.gradeStats}>
          {Object.entries(response.gradeCounts || {}).map(([grade, count]) => <span key={grade}>{grade} {count}건</span>)}
        </div>
        <section className={styles.outputCard}>
          <div className={styles.outputHeader}><div><h2>복사 대상 JSON</h2><p>항목당 title · link · grade 3개 필드만 포함합니다.</p></div><button onClick={() => void copyItems()} disabled={!items.length} type="button"><Clipboard size={15} /> {copied ? "복사됨" : "JSON 복사"}</button></div>
          <pre>{copiedJson}</pre>
        </section>
        {items.length === 0 ? <p className={styles.empty}>선택한 날짜에 저장된 해외 RSS·SEC 공시가 없습니다.</p> : <div className={styles.list}>
          {items.map((item, index) => <article className={styles.card} key={`${item.link}-${index}`}>
            <div className={styles.cardTop}><span className={styles.index}>#{index + 1}</span><span className={styles.grade}>{item.grade}</span></div>
            <h2>{item.title}</h2>
            <a href={item.link} target="_blank" rel="noreferrer"><span>{item.link}</span><ExternalLink size={14} /></a>
          </article>)}
        </div>}
      </>}
    </section>
  );
}
