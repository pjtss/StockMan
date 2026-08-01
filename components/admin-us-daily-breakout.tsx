"use client";
import { useEffect, useState } from "react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type Item = { market: string; code: string; name?: string };
export function AdminUsDailyBreakout() {
  const [items, setItems] = useState<Item[]>([]); const [market, setMarket] = useState("NAS"); const [code, setCode] = useState(""); const [result, setResult] = useState<unknown>(null); const [error, setError] = useState("");
  async function load() { const r = await fetch("/api/admin/us-daily-breakout-watchlist"); const d = await r.json(); setItems(d.items || []); }
  useEffect(() => { void load(); }, []);
  async function add() { const r = await fetch("/api/admin/us-daily-breakout-watchlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ market, code }) }); const d = await r.json(); if (!r.ok) setError(d.error || "등록 실패"); else { setCode(""); setItems(d.items || []); } }
  async function remove(item: Item) { const r = await fetch("/api/admin/us-daily-breakout-watchlist", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }); setItems((await r.json()).items || []); }
  async function run(sendDiscord: boolean) { const r = await fetch(`/api/admin/us-daily-breakout-test${sendDiscord ? "" : ""}`, { method: sendDiscord ? "POST" : "GET" }); setResult(await r.json()); }
  return <AdminPageShell eyebrow="US DAILY BREAKOUT" title="일봉 5일 고가 돌파 관심종목" description="오늘 현재가가 직전 5거래일 최고가를 상회하는지 검사합니다.">
    <section className={styles.card}><div className={styles.cardActions}><select className={styles.textInput} value={market} onChange={(e) => setMarket(e.target.value)}><option>NAS</option><option>NYS</option><option>AMS</option></select><input className={styles.textInput} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="티커 예: AAPL"/><button className={styles.toggleButton} onClick={() => void add()} disabled={!code.trim()}>관심종목 등록</button></div>{error && <p>{error}</p>}</section>
    <section className={styles.card}><h2>등록 종목</h2>{items.map((item) => <div key={`${item.market}:${item.code}`} className={styles.cardHeader}><strong>{item.market} {item.code}</strong><button className={styles.logoutButton} onClick={() => void remove(item)}>삭제</button></div>)}{!items.length && <p>등록된 종목이 없습니다.</p>}</section>
    <section className={styles.card}><div className={styles.cardActions}><button className={styles.toggleButton} onClick={() => void run(false)}>분석 테스트</button><button className={styles.toggleButton} onClick={() => void run(true)}>분석 후 Discord 전송</button></div><pre style={{ whiteSpace: "pre-wrap" }}>{result ? JSON.stringify(result, null, 2) : ""}</pre></section>
  </AdminPageShell>;
}

