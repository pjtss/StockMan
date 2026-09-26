"use client";

import { useState } from "react";
import styles from "./sec-company-facts-lookup.module.css";

type Snapshot = { cik: string; payload: Record<string, unknown>; fetchedAt: string };
type LookupResult = { cik: string; mapping: { name: string; ticker: string; exchange: string } | null; result: { entityName: string | null; factCount: number; taxonomyCount: number; fetchedAt: string; archivedId: number | string | null } };

export function SecCompanyFactsLookup() {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingJson, setLoadingJson] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true); setMessage(""); setLookup(null); setSnapshot(null); setShowJson(false);
    try {
      const response = await fetch("/api/admin/sec-company-facts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: query.trim() }), cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(response.status === 401 ? "관리자 세션으로 로그인해야 조회할 수 있습니다." : body?.error || `조회 실패 (HTTP ${response.status})`);
      setLookup(body as LookupResult);
      setMessage("SEC Company Facts를 조회해 DB 최신 스냅샷과 원문 이력에 저장했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "조회에 실패했습니다."); }
    finally { setLoading(false); }
  }

  async function loadSavedJson() {
    if (!lookup) return;
    setLoadingJson(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/sec-company-facts?cik=${encodeURIComponent(lookup.cik)}`, { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(response.status === 401 ? "관리자 세션으로 로그인해야 합니다." : body?.error || `저장 데이터 조회 실패 (HTTP ${response.status})`);
      setSnapshot(body.snapshot as Snapshot); setShowJson(true);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장 JSON 조회에 실패했습니다."); }
    finally { setLoadingJson(false); }
  }

  const json = snapshot ? JSON.stringify(snapshot.payload, null, 2) : "";
  async function copyJson() {
    try { await navigator.clipboard.writeText(json); setMessage("전체 Company Facts JSON을 클립보드에 복사했습니다."); }
    catch { setMessage("클립보드 복사에 실패했습니다. JSON 영역을 직접 선택해 복사해 주세요."); }
  }
  function downloadJson() {
    if (!snapshot) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sec-company-facts-${snapshot.cik}-${snapshot.fetchedAt.slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  return <section className={styles.card}>
    <div><span className="kicker">SEC COMPANY FACTS</span><h2>종목별 SEC 원천 재무 데이터 조회</h2><p>티커 또는 CIK로 SEC 공식 Company Facts를 조회하고 DB에 저장합니다. 저장된 전체 원본 JSON은 확인·복사·다운로드할 수 있습니다.</p></div>
    <form className={styles.form} onSubmit={(event) => void submit(event)}>
      <label htmlFor="sec-company-facts-query">미국 종목 티커 또는 CIK</label>
      <div className={styles.controls}><input id="sec-company-facts-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AAPL 또는 0000320193" autoCapitalize="characters" autoComplete="off" required maxLength={50} /><button type="submit" disabled={loading || !query.trim()}>{loading ? "SEC 조회 중…" : "조회 및 DB 저장"}</button></div>
    </form>
    {message && <p className={styles.message} role="status">{message}</p>}
    {lookup && <div className={styles.result}>
      <h3>{lookup.result.entityName || lookup.mapping?.name || "회사명 미제공"} <span>{lookup.mapping?.ticker || query.toUpperCase()}</span></h3>
      <dl><div><dt>CIK</dt><dd>{lookup.cik}</dd></div><div><dt>거래소</dt><dd>{lookup.mapping?.exchange || "SEC ticker map 미확인"}</dd></div><div><dt>Taxonomy</dt><dd>{lookup.result.taxonomyCount.toLocaleString()}개</dd></div><div><dt>Concept</dt><dd>{lookup.result.factCount.toLocaleString()}개</dd></div><div><dt>SEC 조회 시각</dt><dd>{new Date(lookup.result.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST</dd></div><div><dt>원문 보관 ID</dt><dd>{lookup.result.archivedId ?? "중복 원문 생략"}</dd></div></dl>
      <div className={styles.actions}><button type="button" onClick={() => void loadSavedJson()} disabled={loadingJson}>{loadingJson ? "DB에서 불러오는 중…" : showJson ? "저장 JSON 새로고침" : "저장된 전체 JSON 보기"}</button>{snapshot && <><button type="button" onClick={() => void copyJson()}>전체 JSON 복사</button><button type="button" className={styles.secondary} onClick={downloadJson}>JSON 파일 다운로드</button></>}</div>
      {showJson && snapshot && <textarea className={styles.json} aria-label="저장된 전체 SEC Company Facts JSON" readOnly value={json} spellCheck={false} />}
    </div>}
    <p className={styles.note}>수동 수집은 관리자 세션이 필요합니다. 자동 갱신은 <code>/admin/modules/sec-company-facts</code>에서 설정하며, CIK 목록이 없으면 SEC_SYNC_CIKS 환경변수 대상만 실행합니다.</p>
  </section>;
}
