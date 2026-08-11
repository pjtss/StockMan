"use client";
import { useEffect, useState } from "react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type Row = { market: string; code: string; name: string; instrument_type: string; is_etf: boolean; is_leveraged: boolean; is_inverse: boolean; is_derivative_product: boolean; classification_source: string; manual_product_action: string | null };
export function AdminUsInstrumentProducts() {
  const [rows, setRows] = useState<Row[]>([]); const [error, setError] = useState<string | null>(null);
  async function load() { const response = await fetch("/api/admin/us-instrument-products", { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "상품 분류를 불러오지 못했습니다."); setRows(data.rows || []); }
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);
  async function override(row: Row, action: "BLOCK" | null) { const response = await fetch("/api/admin/us-instrument-products", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ market: row.market, code: row.code, action }) }); if (!response.ok) { const data = await response.json(); setError(data.error || "저장 실패"); return; } await load(); }
  return <AdminPageShell eyebrow="PRODUCT CONTROL" title="미국 상품 분류" description="ETF·ETN·레버리지·인버스·파생상품은 자동으로 탐지 대상에서 제외합니다. 예외 허용은 지원하지 않습니다.">{error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}<section className={styles.statusGrid}>{rows.map((row) => <article key={`${row.market}:${row.code}`} className={styles.card}><div className={styles.cardHeader}><strong className={styles.cardTitle}>{row.market} {row.code}</strong><span>{row.instrument_type}</span></div><p>{row.name || "이름 없음"}</p><p>자동 분류: {row.classification_source} · {row.is_etf || row.is_leveraged || row.is_inverse || row.is_derivative_product ? "차단" : "일반주식"}</p><p>수동 상태: {row.manual_product_action || "자동 판정"}</p><div className={styles.cardActions}><button className={styles.logoutButton} onClick={() => void override(row, "BLOCK")}>차단</button><button className={styles.logoutButton} onClick={() => void override(row, null)}>자동 판정</button></div></article>)}</section></AdminPageShell>;
}
