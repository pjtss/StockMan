"use client";

import { useEffect, useState } from "react";

type Payload = {
  ok: boolean;
  generatedAt: string;
  summaries: Array<{ probeName: string; sampleCount: number; failureCount: number; averageDurationMs: number; maxDurationMs: number; latest: { checked_at: string; duration_ms: number; ok: boolean } }>;
  alerts: Array<{ probeName: string; code: string; message: string; latestDurationMs: number }>;
  records: Array<{ probe_name: string; checked_at: string; duration_ms: number; ok: boolean; error_code: string | null }>;
};

export function AdminHealthProbeHistory() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/health-probe-history", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || `HTTP ${response.status}`);
      setData(body);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return <section className="adminCard">
    <div className="adminCardHeader"><div><h2>최근 24시간 DB probe</h2><p>5분 간격으로 수집하며 14일 후 자동 정리합니다.</p></div><button type="button" onClick={() => void load()} disabled={loading}>{loading ? "조회 중…" : "새로고침"}</button></div>
    {error && <p role="alert">이력 조회 실패: {error}</p>}
    {data && <>
      <p>마지막 조회: {new Date(data.generatedAt).toLocaleString("ko-KR")}</p>
      {data.alerts.length > 0 ? <ul role="alert">{data.alerts.map((alert) => <li key={`${alert.probeName}:${alert.code}`}>{alert.probeName}: {alert.message}</li>)}</ul> : <p>현재 감지된 경보가 없습니다.</p>}
      <div className="adminTableWrap"><table className="adminTable"><thead><tr><th>Probe</th><th>표본</th><th>실패</th><th>평균</th><th>최대</th><th>최근 상태</th><th>최근 실행</th></tr></thead><tbody>{data.summaries.map((item) => <tr key={item.probeName}><td>{item.probeName}</td><td>{item.sampleCount}</td><td>{item.failureCount}</td><td>{item.averageDurationMs}ms</td><td>{item.maxDurationMs}ms</td><td>{item.latest.ok ? "정상" : "실패"} · {item.latest.duration_ms}ms</td><td>{new Date(item.latest.checked_at).toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div>
      <h3>최근 probe 기록</h3><div className="adminTableWrap"><table className="adminTable"><thead><tr><th>시각</th><th>Probe</th><th>상태</th><th>소요</th><th>오류 코드</th></tr></thead><tbody>{data.records.map((row, index) => <tr key={`${row.checked_at}:${row.probe_name}:${index}`}><td>{new Date(row.checked_at).toLocaleString("ko-KR")}</td><td>{row.probe_name}</td><td>{row.ok ? "정상" : "실패"}</td><td>{row.duration_ms}ms</td><td>{row.error_code || "—"}</td></tr>)}</tbody></table></div>
    </>}
  </section>;
}
