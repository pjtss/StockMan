"use client";

import { useState } from "react";
import { ChartModal } from "@/components/chart-modal";

type Props = { market: "KR" | "US"; mode?: "all" | "scalp" | "swing" };
type Result = { rank: number; code: string; name: string; score: number; latest?: { date?: string; updatedAt?: string | null; close?: number }; reasons?: string[]; flow?: { obvAboveSignal?: boolean; adlAboveSignal?: boolean }; timeframeMeta?: { daily?: { date?: string; updatedAt?: string | null }; weekly?: { date?: string; updatedAt?: string | null }; monthly?: { date?: string; updatedAt?: string | null } } };

export function TechnicalEntryResults({ market, mode = "all" }: Props) {
  const [results, setResults] = useState<Result[]>([]), [tickers, setTickers] = useState(""), [status, setStatus] = useState(""), [selected, setSelected] = useState<Result | null>(null);
  async function run() {
    setStatus("조회 중…");
    try { const response = await fetch(`/api/scan/technical-entry-analysis?market=${market}&mode=${mode}&limit=100`, { credentials: "same-origin" }); const json = await response.json(); if (!response.ok) throw new Error(json.error ?? `HTTP ${response.status}`); setResults(json.results ?? []); setTickers(json.tickers ?? ""); setStatus(`완료 · ${json.resultCount ?? json.results?.length ?? 0}개`); } catch (error) { setStatus(`실패 · ${error instanceof Error ? error.message : String(error)}`); }
  }
  async function copy() { if (!tickers) return; await navigator.clipboard?.writeText(tickers); setStatus("티커를 복사했습니다."); }
  return <section style={{ marginTop: 18, border: "1px solid rgba(148,163,184,.2)", borderRadius: 16, padding: 16, overflowX: "auto" }}><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong>통합 진입 후보</strong><button type="button" onClick={run}>조회</button><button type="button" onClick={copy} disabled={!tickers}>티커 복사</button><small>{status}</small></div>{tickers && <p style={{ fontFamily: "monospace", fontSize: 12, overflowWrap: "anywhere" }}>{tickers}</p>}<table style={{ width: "100%", minWidth: 760, borderCollapse: "collapse", marginTop: 12 }}><thead><tr>{["순위", "종목", "점수", "현재가", "일봉", "주봉", "월봉", "OBV/ADL", "근거", "차트"].map(x => <th key={x} style={{ textAlign: "left", padding: 8, borderBottom: "1px solid rgba(148,163,184,.2)" }}>{x}</th>)}</tr></thead><tbody>{results.map(result => <tr key={result.code}><td style={{ padding: 8 }}>{result.rank}</td><td style={{ padding: 8 }}><strong>{result.code}</strong><br/><small>{result.name}</small></td><td style={{ padding: 8 }}>{result.score}</td><td style={{ padding: 8 }}>{result.latest?.close ?? "-"}</td><td style={{ padding: 8 }}>{result.timeframeMeta?.daily?.date ?? "-"}</td><td style={{ padding: 8 }}>{result.timeframeMeta?.weekly?.date ?? "-"}</td><td style={{ padding: 8 }}>{result.timeframeMeta?.monthly?.date ?? "-"}</td><td style={{ padding: 8 }}>{result.flow?.obvAboveSignal && result.flow?.adlAboveSignal ? "OBV·ADL 양호" : result.flow?.obvAboveSignal || result.flow?.adlAboveSignal ? "일부 양호" : "주의"}</td><td style={{ padding: 8 }}>{result.reasons?.join(" · ") || "-"}</td><td style={{ padding: 8 }}><button type="button" onClick={() => setSelected(result)}>차트</button></td></tr>)}</tbody></table>{selected && <ChartModal code={market === "US" ? `US:${selected.code}` : selected.code} company={selected.name || selected.code} onClose={() => setSelected(null)} />}</section>;
}
