"use client";

import { useState } from "react";

export function DomesticFinancialExport() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function download(raw = false, llm = false) {
    setLoading(true); setMessage("");
    try {
      const response = await fetch(`/api/domestic-financial-export${raw ? "?format=raw" : llm ? "?format=llm" : ""}`, { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error ?? `HTTP ${response.status}`); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `domestic-financial-${raw ? "raw" : llm ? "llm" : "data"}-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage(`${raw ? "원천" : llm ? "LLM 통합" : "정규화"} JSON 다운로드를 시작했습니다.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "다운로드에 실패했습니다."); }
    finally { setLoading(false); }
  }
  return <section className="otherExportCard"><div><span className="kicker">DOMESTIC DATA EXPORT</span><h2>국내 기업 데이터</h2><p>LLM 입력용 원천 payload, 정규화 재무 데이터, 일·주·월봉 통합 데이터를 JSON으로 내려받습니다.</p></div><div className="otherExportActions"><button type="button" onClick={() => void download(true)} disabled={loading}>{loading ? "준비 중…" : "원천 JSON 다운로드"}</button><button type="button" onClick={() => void download(false, true)} disabled={loading}>LLM 통합 JSON</button><button type="button" className="otherExportSecondary" onClick={() => void download(false)} disabled={loading}>정규화 JSON</button></div>{message && <p role="status" className="otherExportStatus">{message}</p>}</section>;
}
