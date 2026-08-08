"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Eye, RefreshCw, XCircle } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import styles from "@/app/admin/observability/observability.module.css";

type Run = {
  id: number;
  moduleKey: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  summary?: Record<string, unknown>;
  errorMessage?: string | null;
};

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
  totals?: { runs?: number; failed?: number; skipped?: number; running?: number; staleRunning?: number };
  failureCategories?: Array<{ errorCode: string; count: number }>;
  coverage?: { scheduledButNeverObservedModuleKeys?: string[]; optionalButNeverObservedModuleKeys?: string[] };
};

function isSuccessful(run: Run | undefined) {
  return run?.status === "SUCCESS" || run?.status === "COMPLETED";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString("ko-KR") : "-";
}

function summarize(run: Run | undefined) {
  if (!run) return "실행 이력 없음";
  if (run.errorMessage) return run.errorMessage;
  const entries = Object.entries(run.summary || {}).slice(0, 3);
  return entries.length ? entries.map(([key, value]) => `${key}: ${String(value)}`).join(" · ") : "요약 정보 없음";
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
          <span className={styles.count}>{modules.length}개 기능 · {totalRuns}회 · 실패 {totals?.failed ?? 0} · 스킵 {totals?.skipped ?? 0}</span>
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
            const skipped = latest?.status === "SKIPPED";
            const notScheduled = module.scheduler === "NOT_SCHEDULED";
            return (
              <article className={styles.card} key={module.key}>
                <div className={styles.cardHeading}>
                  <div><span className={styles.moduleKey}>{module.key}</span><h2>{module.label}</h2></div>
                  {latest ? skipped ? <Clock3 className={styles.skipped} size={20} /> : success ? <CheckCircle2 className={styles.success} size={20} /> : <XCircle className={styles.failure} size={20} /> : <Clock3 className={styles.muted} size={20} />}
                </div>
                <p className={styles.moduleMeta}>{module.scheduler === "OPTIONAL_CRON" ? "선택적 OCI cron" : module.scheduler === "NOT_SCHEDULED" ? "예약 없음" : module.coverage === "NO_RUN" ? "OCI cron 미관측" : "OCI cron 관측됨"}</p>
                <dl className={styles.summary}>
                  <div><dt>최근 상태</dt><dd className={success ? styles.successText : skipped ? styles.skipped : latest ? styles.failureText : ""}>{latest?.status || "없음"}</dd></div>
                  <div><dt>최근 실행</dt><dd>{formatDate(latest?.startedAt)}</dd></div>
                  <div><dt>실행 건수</dt><dd>{module.runCount ?? module.runs.length}건</dd></div>
                </dl>
                <p className={styles.preview}>{latest ? summarize(latest) : notScheduled ? "이 모듈은 자동 예약 대상이 아닙니다." : "아직 실행 이력이 없습니다."}</p>
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
                <header className={styles.runHeader}><strong>{run.status}</strong><time>{formatDate(run.startedAt)}</time></header>
                {run.errorMessage && <p className={styles.runError}>{run.errorMessage}</p>}
                <pre>{JSON.stringify(run.summary || {}, null, 2)}</pre>
              </article>
            ))}
          </div>
        </AdminModal>
      )}
    </section>
  );
}
