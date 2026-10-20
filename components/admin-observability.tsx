"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Eye, RefreshCw, XCircle } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import styles from "@/app/admin/observability/observability.module.css";
import { getMarketRssTranslationReasonDisplay } from "@/lib/market-rss-translation-reason";

type Run = {
  id: number;
  moduleKey: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  observability?: { requestId?: string | null; cronRunId?: string | null; durationMs?: number | null };
  summary?: Record<string, unknown>;
  items?: Array<{
    market?: string | null;
    code?: string | null;
    status?: string | null;
    error_code?: string | null;
    error_message?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
  }>;
  errorMessage?: string | null;
};

type CompletionNotification = { sent?: boolean; skipped?: boolean; reason?: string; error?: string };

type Module = {
  key: string;
  label: string;
  description?: string;
  scheduler?: "OCI_CRON" | "OPTIONAL_CRON" | "NOT_SCHEDULED";
  coverage?: "OBSERVED" | "NO_RUN";
  runCount?: number;
  counts?: { success?: number; partial?: number; failed?: number; running?: number; skipped?: number; staleRunning?: number };
  runs: Run[];
};

type DebugSnapshot = {
  modules: Module[];
  totals?: { runs?: number; partial?: number; failed?: number; skipped?: number; running?: number; staleRunning?: number };
  failureCategories?: Array<{ errorCode: string; count: number }>;
  coverage?: { scheduledButNeverObservedModuleKeys?: string[]; optionalButNeverObservedModuleKeys?: string[] };
};

function isSuccessful(run: Run | undefined) {
  return run?.status === "SUCCESS" || run?.status === "COMPLETED";
}

function isPartial(run: Run | undefined) {
  return run?.status === "PARTIAL";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function summarize(run: Run | undefined) {
  if (!run) return "실행 이력 없음";
  if (run.errorMessage) return run.errorMessage;
  if (run.moduleKey === "market-rss") {
    const summary = run.summary || {};
    const translated = summary.translated && typeof summary.translated === "object"
      ? summary.translated as Record<string, unknown>
      : {};
    const reasons = translated.fallbackReasons && typeof translated.fallbackReasons === "object"
      ? translated.fallbackReasons as Record<string, unknown>
      : {};
    const activeReasons = Object.entries(reasons)
      .filter(([, count]) => typeof count === "number" && count > 0);
    const reasonSummary = activeReasons
      .slice(0, 3)
      .map(([reason, count]) => `${getMarketRssTranslationReasonDisplay(reason).shortLabel} ${count}건`);
    const translationIssueCount = typeof summary.translationFailureCount === "number" ? summary.translationFailureCount : 0;
    const ingestIssueCount = typeof summary.ingestFailureCount === "number" ? summary.ingestFailureCount : 0;
    const issueCount = typeof summary.partialFailureCount === "number"
      ? summary.partialFailureCount
      : ingestIssueCount + translationIssueCount;
    if (summary.counterDataInvalid === true) {
      return `RSS 수집·번역 집계 오류 · 확인된 이슈 ${issueCount}건 · 실제 건수 확인 필요 (수집 ${ingestIssueCount} · 번역 ${translationIssueCount})`;
    }
    if (issueCount > 0 || reasonSummary.length > 0) {
      const breakdown = `수집 ${ingestIssueCount} · 번역 ${translationIssueCount}`;
      const omittedReasonCount = activeReasons.length - reasonSummary.length;
      const omittedReasonSummary = omittedReasonCount > 0 ? ` · 외 ${omittedReasonCount}종 생략` : "";
      return `RSS 수집·번역 이슈 ${issueCount}건 (${breakdown})${reasonSummary.length ? ` · 번역 ${reasonSummary.join(" · ")}${omittedReasonSummary}` : ""}`;
    }
    const translatedCount = typeof translated.translated === "number" ? translated.translated : 0;
    const notRequired = typeof translated.notRequired === "number" ? translated.notRequired : 0;
    return `RSS 번역 ${translatedCount}건 · 번역 불필요 ${notRequired}건`;
  }
  const entries = Object.entries(run.summary || {}).slice(0, 3);
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ") : "요약 정보 없음";
}

function completionStatus(run: Run | undefined) {
  const value = run?.summary?.notifications;
  const completion = value && typeof value === "object" && "completion" in value
    ? (value as { completion?: CompletionNotification }).completion
    : undefined;
  if (!completion) return null;
  if (completion.sent) return "Discord 완료 알림 전송됨";
  if (completion.reason === "delivery_failed") return `Discord 완료 알림 실패${completion.error ? `: ${completion.error}` : ""}`;
  if (completion.skipped) return `Discord 완료 알림 건너뜀${completion.reason ? ` (${completion.reason})` : ""}`;
  return "Discord 완료 알림 미전송";
}

function InstrumentRefreshPerformance({ run }: { run: Run }) {
  const value = run.summary?.performance;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const performance = value as Record<string, unknown>;
  const metrics: Array<[string, unknown, string]> = [
    ["전체 경과", performance.wallDurationMs, "ms"],
    ["KIS 호출 누적(병렬 합산)", performance.fetchDurationMs, "ms"],
    ["DB 쓰기 누적", performance.dbWriteDurationMs, "ms"],
    ["쓰기 큐 대기", performance.writeQueueWaitMs, "ms"],
    ["처리율", performance.instrumentsPerSecond, "종목/초"],
  ];
  const available = metrics.filter(([, raw]) => typeof raw === "number" && Number.isFinite(raw));
  if (available.length === 0) return null;
  return (
    <section className={styles.performance} aria-label="기본정보 갱신 성능">
      <h3>기본정보 갱신 성능</h3>
      <dl>
        {available.map(([label, raw, unit]) => (
          <div key={label}><dt>{label}</dt><dd>{Number(raw).toLocaleString("ko-KR", { maximumFractionDigits: 2 })} {unit}</dd></div>
        ))}
      </dl>
      <p>KIS 누적시간은 병렬 요청 시간이 겹칠 수 있어 전체 경과시간과 직접 합산하지 않습니다.</p>
    </section>
  );
}

export function AdminObservability() {
  const [modules, setModules] = useState<Module[]>([]);
  const [totals, setTotals] = useState<DebugSnapshot["totals"]>({});
  const [failureCategories, setFailureCategories] = useState<NonNullable<DebugSnapshot["failureCategories"]>>([]);
  const [coverage, setCoverage] = useState<DebugSnapshot["coverage"]>({});
  const [selected, setSelected] = useState<Module | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/debug/automation-runs?limit=10", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const value = await response.json() as DebugSnapshot;
      setModules(Array.isArray(value.modules) ? value.modules : []);
      setTotals(value.totals || {});
      setFailureCategories(Array.isArray(value.failureCategories) ? value.failureCategories : []);
      setCoverage(value.coverage || {});
    } catch {
      setError("실행 이력을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const totalRuns = useMemo(() => totals?.runs ?? modules.reduce((total, module) => total + module.runs.length, 0), [modules, totals?.runs]);

  return (
    <section className={styles.container}>
      <header className={styles.toolbar}>
        <div>
          <strong>기능별 실행 요약</strong>
          <p>전체 내용을 펼치지 않고, 필요한 분류만 상세 보기로 확인합니다.</p>
        </div>
        <div className={styles.toolbarActions}>
          <span className={styles.count}>{modules.length}개 기능 · {totalRuns}회 · 부분 {totals?.partial ?? 0} · 실패 {totals?.failed ?? 0} · 스킵 {totals?.skipped ?? 0}</span>
          <button className={styles.refreshButton} onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? styles.spin : undefined} /> 새로고침
          </button>
        </div>
      </header>

      {(failureCategories.length > 0 || (coverage?.scheduledButNeverObservedModuleKeys?.length ?? 0) > 0) && (
        <div className={styles.diagnosticsBar}>
          {failureCategories.length > 0 && <span>주요 실패: {failureCategories.slice(0, 3).map((item) => `${item.errorCode} ${item.count}건`).join(" · ")}</span>}
          {(coverage?.scheduledButNeverObservedModuleKeys?.length ?? 0) > 0 && <span>미관측 예약: {coverage?.scheduledButNeverObservedModuleKeys?.join(", ")}</span>}
        </div>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {loading && modules.length === 0 ? <p className={styles.empty}>실행 이력을 불러오는 중입니다.</p> : modules.length === 0 ? <p className={styles.empty}>표시할 실행 이력이 없습니다.</p> : (
        <div className={styles.grid}>
          {modules.map((module) => {
            const latest = module.runs[0];
            const success = isSuccessful(latest);
            const partial = isPartial(latest);
            const skipped = latest?.status === "SKIPPED";
            const notScheduled = module.scheduler === "NOT_SCHEDULED";
            return (
              <article className={styles.card} key={module.key}>
                <div className={styles.cardHeading}>
                  <div><span className={styles.moduleKey}>{module.key}</span><h2>{module.label}</h2></div>
                  {latest ? skipped ? <Clock3 className={styles.skipped} size={20} /> : success ? <CheckCircle2 className={styles.success} size={20} /> : partial ? <AlertTriangle className={styles.partial} size={20} /> : <XCircle className={styles.failure} size={20} /> : <Clock3 className={styles.muted} size={20} />}
                </div>
                <p className={styles.moduleMeta}>{module.scheduler === "OPTIONAL_CRON" ? "선택적 OCI cron" : module.scheduler === "NOT_SCHEDULED" ? "예약 없음" : module.coverage === "NO_RUN" ? "OCI cron 미관측" : "OCI cron 관측됨"}</p>
                <dl className={styles.summary}>
                  <div><dt>최근 상태</dt><dd className={success ? styles.successText : partial ? styles.partialText : skipped ? styles.skipped : latest ? styles.failureText : ""}>{latest?.status || "없음"}</dd></div>
                  <div><dt>최근 실행</dt><dd>{formatDate(latest?.startedAt)}</dd></div>
                  <div><dt>실행 건수</dt><dd>{module.runCount ?? module.runs.length}건</dd></div>
                </dl>
                <p className={styles.preview}>{latest ? summarize(latest) : notScheduled ? "이 모듈은 자동 예약 대상이 아닙니다." : "아직 실행 이력이 없습니다."}</p>
                {completionStatus(latest) && <p className={styles.moduleMeta}>{completionStatus(latest)}</p>}
                <button className={styles.detailButton} onClick={() => setSelected(module)}>
                  <Eye size={15} /> 상세 결과 보기
                </button>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <AdminModal title={`${selected.label} · 실행 상세`} description="최근 실행 결과와 원본 요약을 확인합니다." onClose={() => setSelected(null)} wide>
          <div className={styles.modalList}>
            {selected.runs.map((run) => (
              <article className={styles.run} key={run.id}>
                <header className={styles.runHeader}><strong className={run.status === "PARTIAL" ? styles.partialText : run.status === "FAILED" ? styles.failureText : run.status === "SUCCESS" ? styles.successText : ""}>{run.status}</strong><time>{formatDate(run.startedAt)}</time></header>
                {(run.observability?.requestId || run.durationMs != null) && <p className={styles.runMeta}>requestId: {run.observability?.requestId || "-"} · duration: {run.durationMs ?? run.observability?.durationMs ?? "-"}ms</p>}
                {run.errorMessage && <p className={styles.runError}>{run.errorMessage}</p>}
                {run.moduleKey === "instrument-fundamentals" && <InstrumentRefreshPerformance run={run} />}
                {(run.items?.length ?? 0) > 0 && <p className={styles.runMeta}>종목별 진단 {run.items?.length}건 · 실패 {run.items?.filter((item) => item.status === "FAILED").length ?? 0}건</p>}
                {(run.items?.filter((item) => item.status === "FAILED").length ?? 0) > 0 && (
                  <ul className={styles.failureItems} aria-label="종목별 실패 상세">
                    {run.items!.filter((item) => item.status === "FAILED").map((item, index) => {
                      const errorCode = item.error_code ?? item.errorCode;
                      const errorMessage = item.error_message ?? item.errorMessage;
                      return (
                        <li className={styles.failureItem} key={`${item.market ?? ""}:${item.code ?? index}:${index}`}>
                          <div className={styles.failureItemHeading}>
                            <strong>{[item.market, item.code].filter(Boolean).join(" · ") || "종목 미상"}</strong>
                            <span>실패</span>
                          </div>
                          {errorCode && <code className={styles.itemErrorCode}>{errorCode}</code>}
                          {errorMessage && <p>{errorMessage}</p>}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <pre>{JSON.stringify(run.summary || {}, null, 2)}</pre>
              </article>
            ))}
          </div>
        </AdminModal>
      )}
    </section>
  );
}
