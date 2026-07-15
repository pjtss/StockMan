"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

export function AdminUsTurnoverBlacklist() {
  const [tickers, setTickers] = useState<string[]>([]);
  const [ticker, setTicker] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/admin/us-turnover-blacklist", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "블랙리스트를 불러오지 못했습니다.");
    setTickers(data.tickers || []);
  }

  useEffect(() => { void load().catch((e) => setError(e instanceof Error ? e.message : String(e))); }, []);

  async function add() {
    setError(null);
    const response = await fetch("/api/admin/us-turnover-blacklist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "추가하지 못했습니다."); return; }
    setTickers(data.tickers || []); setTicker("");
  }

  async function remove(value: string) {
    const response = await fetch("/api/admin/us-turnover-blacklist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: value }) });
    const data = await response.json();
    if (!response.ok) { setError(data.error || "삭제하지 못했습니다."); return; }
    setTickers(data.tickers || []);
  }

  return <AdminPageShell eyebrow="FILTER CONTROL" title="AMS 티커 블랙리스트" description="등록한 티커는 시총 대비 거래대금 스캐너와 Discord 자동화에서 제외됩니다.">
    {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}
    <section className={styles.card}>
      <div className={styles.cardActions}>
        <input className={styles.textInput} value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} placeholder="예: SOXS" />
        <button className={styles.toggleButton} onClick={() => void add()} disabled={!ticker.trim()}><Plus size={16} />추가</button>
      </div>
    </section>
    <section className={styles.statusGrid}>
      {tickers.map((value) => <article key={value} className={styles.card}><div className={styles.cardHeader}><strong className={styles.cardTitle}>{value}</strong><button className={styles.logoutButton} onClick={() => void remove(value)} aria-label={`${value} 삭제`}><Trash2 size={16} /></button></div></article>)}
      {tickers.length === 0 && <div className={styles.emptyState}>등록된 티커가 없습니다.</div>}
    </section>
  </AdminPageShell>;
}
