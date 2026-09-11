"use client";

import { useState } from "react";

export function DomesticFinancialExport() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  async function download() {
    setLoading(true); setMessage("");
    try {
      const response = await fetch("/api/domestic-financial-export", { cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => null); throw new Error(body?.error ?? `HTTP ${response.status}`); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
      anchor.href = url; anchor.download = `domestic-financial-data-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setMessage("JSON 다운로드를 시작했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "다운로드에 실패했습니다."); }
    finally { setLoading(false); }
  }
  return <section className="otherExportCard"><div><span className="kicker">DOMESTIC DATA EXPORT</span><h2>국내 기업 재무 데이터</h2><p>로컬 DB에 저장된 국내 보통주 전체의 기본 재무·시세 스냅샷과 원본 payload를 JSON으로 다운로드합니다.</p></div><button type="button" onClick={() => void download()} disabled={loading}>{loading ? "준비 중…" : "JSON 다운로드"}</button>{message && <p role="status" className="otherExportStatus">{message}</p>}</section>;
}
