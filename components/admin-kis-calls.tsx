"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import styles from "@/app/admin/observability/observability.module.css";

type Row = { calls: number; success: number; failures?: number; avg_duration_ms: number; max_duration_ms?: number; day?: string; hour?: string; feature?: string; market?: string };
type Data = { summary: Row; daily: Row[]; hourly: Row[]; features: Row[] };
type ApprovalMinute = { minute: string; accepted: number; rejectedClient: number; rejectedGlobal: number };
type ApprovalMetrics = {
  retentionMinutes: number;
  policy: { windowSeconds: number; perClientLimit: number; globalLimit: number };
  generatedAt: string;
  totals: { accepted: number; rejectedClient: number; rejectedGlobal: number; retryAfter1To10: number; retryAfter11To30: number; retryAfter31To60: number };
  minutes: ApprovalMinute[];
};
type Rate = {
  summary: { events: number; incidents: number; recovered: number; max_observed_tps: number; avg_backoff_ms: number };
  byType: Array<{ limit_type: string; limit_scope: string; events: number }>;
  byEndpoint: Array<{ endpoint: string; tr_id: string; events: number }>;
  events: Array<{ id: number; endpoint: string; kis_msg_cd?: string; limit_type: string; occurred_at: string }>;
};

const n = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR");

export function AdminKisCalls() {
  const [data, setData] = useState<Data | null>(null);
  const [rate, setRate] = useState<Rate | null>(null);
  const [approvalMetrics, setApprovalMetrics] = useState<ApprovalMetrics | null>(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [callsResponse, limitsResponse, approvalResponse] = await Promise.all([
        fetch(`/api/debug/kis-calls?days=${days}&limit=1`, { cache: "no-store" }),
        fetch(`/api/admin/kis-rate-limits?days=${days}&limit=20`, { cache: "no-store" }),
        fetch("/api/admin/kis-realtime-approval-metrics", { cache: "no-store" }),
      ]);
      if (!callsResponse.ok) throw new Error("KIS call metrics unavailable");
      setData(await callsResponse.json());
      if (limitsResponse.ok) setRate(await limitsResponse.json());
      else setRate(null);
      if (approvalResponse.ok) {
        const result = await approvalResponse.json();
        setApprovalMetrics(result.metrics ?? null);
      } else setApprovalMetrics(null);
    } catch {
      setError("KIS 호출량 집계를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [days]);

  const summary = data?.summary;
  const rateSummary = rate?.summary;
  const realtimeApproval = approvalMetrics;

  return (
    <section className={styles.container}>
      <header className={styles.toolbar}>
        <div><strong>실제 호출 집계</strong><p>최근 {days}일</p></div>
        <div className={styles.toolbarActions}>
          <select value={days} onChange={(event) => setDays(Number(event.target.value))}>
            <option value={1}>최근 1일</option><option value={7}>최근 7일</option><option value={30}>최근 30일</option>
          </select>
          <button className={styles.refreshButton} onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> 새로고침</button>
        </div>
      </header>
      {error && <p className={styles.error}>{error}</p>}
      {loading && !data ? <p className={styles.empty}>집계 중입니다.</p> : summary && <>
        <div className={styles.summary}>
          <div><dt>총 호출</dt><dd>{n(summary.calls)}회</dd></div>
          <div><dt>성공</dt><dd>{n(summary.success)}회</dd></div>
          <div><dt>실패</dt><dd>{n(summary.failures)}회</dd></div>
          <div><dt>평균 지연</dt><dd>{n(Math.round(summary.avg_duration_ms))}ms</dd></div>
          <div><dt>최대 지연</dt><dd>{n(summary.max_duration_ms)}ms</dd></div>
        </div>
        <div className={styles.grid}>
          {data.features.map((item) => <article className={styles.card} key={`${item.feature}:${item.market}`}><h2>{item.feature} · {item.market}</h2><p>{n(item.calls)}회 · 평균 {n(Math.round(item.avg_duration_ms))}ms</p></article>)}
        </div>
      </>}

      {rateSummary && <>
        <header className={styles.toolbar}><div><strong>KIS RATE LIMIT 이벤트</strong><p>DB 감사 로그 · 운영 보호 한도 10 TPS</p></div></header>
        <div className={styles.summary}>
          <div><dt>이벤트</dt><dd>{n(rateSummary.events)}건</dd></div>
          <div><dt>Incident</dt><dd>{n(rateSummary.incidents)}건</dd></div>
          <div><dt>복구 완료</dt><dd>{n(rateSummary.recovered)}건</dd></div>
          <div><dt>최대 관측 TPS</dt><dd>{n(rateSummary.max_observed_tps)}</dd></div>
          <div><dt>평균 Backoff</dt><dd>{n(Math.round(rateSummary.avg_backoff_ms))}ms</dd></div>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}><h2>유형·범위</h2>{rate!.byType.map((item) => <p key={`${item.limit_type}:${item.limit_scope}`}>{item.limit_type} · {item.limit_scope} · <strong>{n(item.events)}건</strong></p>)}</article>
          <article className={styles.card}><h2>엔드포인트</h2>{rate!.byEndpoint.map((item) => <p key={`${item.endpoint}:${item.tr_id}`}>{item.endpoint} · {item.tr_id} · <strong>{n(item.events)}건</strong></p>)}</article>
          <article className={styles.card}><h2>최근 이벤트</h2>{rate!.events.map((item) => <p key={item.id}>{new Date(item.occurred_at).toLocaleString("ko-KR")} · {item.limit_type} · {item.kis_msg_cd ?? "-"}</p>)}</article>
        </div>
      </>}

      {realtimeApproval && <>
        <header className={styles.toolbar}>
          <div><strong>차트 WebSocket Approval API · 최근 {realtimeApproval.retentionMinutes}분</strong><p>현재 프로세스 메모리 집계 · IP 주소 및 요청 단위 식별정보 미수집 · 재시작/배포 시 초기화</p></div>
          <small>갱신 {new Date(realtimeApproval.generatedAt).toLocaleTimeString("ko-KR")}</small>
        </header>
        <div className={styles.summary}>
          <div><dt>허용</dt><dd>{n(realtimeApproval.totals.accepted)}회</dd></div>
          <div><dt>IP 한도 초과</dt><dd>{n(realtimeApproval.totals.rejectedClient)}회</dd></div>
          <div><dt>전체 한도 초과</dt><dd>{n(realtimeApproval.totals.rejectedGlobal)}회</dd></div>
          <div><dt>Retry-After 1–10초</dt><dd>{n(realtimeApproval.totals.retryAfter1To10)}회</dd></div>
          <div><dt>Retry-After 11–30초</dt><dd>{n(realtimeApproval.totals.retryAfter11To30)}회</dd></div>
          <div><dt>Retry-After 31–60초</dt><dd>{n(realtimeApproval.totals.retryAfter31To60)}회</dd></div>
        </div>
        <div className={styles.grid}>
          <article className={styles.card}>
            <h2>분별 요청 추이 · 마지막 10분</h2>
            <p>한도: IP당 {realtimeApproval.policy.perClientLimit}회 / {realtimeApproval.policy.windowSeconds}초 · 전체 {realtimeApproval.policy.globalLimit}회 / {realtimeApproval.policy.windowSeconds}초</p>
            {realtimeApproval.minutes.slice(-10).map((minute) => <p key={minute.minute}>{new Date(minute.minute).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} · 허용 {n(minute.accepted)} · IP 제한 {n(minute.rejectedClient)} · 전체 제한 {n(minute.rejectedGlobal)}</p>)}
          </article>
        </div>
      </>}
    </section>
  );
}
