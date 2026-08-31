"use client";
import { useEffect, useState } from "react";
import styles from "@/app/admin/page.module.css";

type Result = { tables: string[]; columns: Array<{ name: string; type: string }>; rows: Array<Record<string, unknown>> };
export function DatabaseBrowser() {
  const [data, setData] = useState<Result>({ tables: [], columns: [], rows: [] });
  const [table, setTable] = useState("");
  const [error, setError] = useState("");
  async function load(name = table) { const response = await fetch(`/api/admin/database${name ? `?table=${encodeURIComponent(name)}` : ""}`, { cache: "no-store" }); const body = await response.json(); if (!response.ok) { setError(body.error || "조회 실패"); return; } setData(body); setError(""); }
  useEffect(() => { void load(""); }, []);
  return <section className={styles.controlStack}><div className={styles.card}><label className={styles.fieldLabel}>테이블<select className={styles.textInput} value={table} onChange={(event) => { setTable(event.target.value); void load(event.target.value); }}><option value="">테이블을 선택하세요</option>{data.tables.map((name) => <option key={name}>{name}</option>)}</select></label>{error && <p className={styles.resultError}>{error}</p>}</div>{table && <div className={styles.card}><h2 className={styles.cardTitle}>{table} · 최근 100건</h2><div style={{ overflowX: "auto" }}><table><thead><tr>{data.columns.map((column) => <th key={column.name}>{column.name}</th>)}</tr></thead><tbody>{data.rows.map((row, index) => <tr key={index}>{data.columns.map((column) => <td key={column.name}>{String(row[column.name] ?? "")}</td>)}</tr>)}</tbody></table></div></div>}</section>;
}
