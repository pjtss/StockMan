"use client";

import { Copy, Play } from "lucide-react";
import { useMemo, useState } from "react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/daily-indicators/daily-indicators.module.css";
import { copyToClipboard } from "@/lib/copy-to-clipboard";

type ModuleResult = { ok: boolean; data?: any; error?: string };
type AggregateResult = {
  ok: boolean;
  checkedAt?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  dataPolicy?: Record<string, unknown>;
  results?: Record<string, ModuleResult>;
  error?: string;
};

type CopyTarget = "all" | (typeof MODULES)[number]["key"];

const MODULES = [
  { key: "dailyBreakout", label: "일봉 돌파", description: "당일 시가와 이전 5거래일 고가 비교" },
  { key: "mfi", label: "MFI", description: "DB 저장 일봉 기준 과매도 탐지" },
  { key: "dmi", label: "DMI", description: "DB 저장 일봉 기준 +DI·ADX 탐지" },
  { key: "macd", label: "MACD", description: "DB 저장 일봉 기준 MACD 상승 탐지" },
  { key: "obv", label: "OBV", description: "DB 저장 일봉 기준 OBV 상승 탐지" },
] as const;

function countQualified(result: ModuleResult | undefined) {
  return result?.ok && result.data && Array.isArray(result.data.qualified) ? result.data.qualified.length : 0;
}

function countResults(result: ModuleResult | undefined) {
  if (!result?.ok || !result.data) return 0;
  return Array.isArray(result.data.results) ? result.data.results.length : Number(result.data.resultCount ?? 0);
}

export function AdminDailyIndicators() {
  const [result, setResult] = useState<AggregateResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copiedTarget, setCopiedTarget] = useState<CopyTarget | null>(null);
  const [breakoutLimit, setBreakoutLimit] = useState("");
  const [responseMode, setResponseMode] = useState<"full" | "summary">("full");
  const [error, setError] = useState<string | null>(null);

  const formatted = useMemo(() => (result ? JSON.stringify(result, null, 2) : ""), [result]);

  async function runAll() {
    setRunning(true);
    setCopiedTarget(null);
    setError(null);
    try {
      const queryParams = new URLSearchParams({ mode: responseMode });
      if (breakoutLimit.trim()) queryParams.set("breakoutLimit", breakoutLimit.trim());
      const response = await fetch(`/api/admin/us-daily-indicators-test?${queryParams.toString()}`, { cache: "no-store" });
      const rawBody = await response.text();
      let data: AggregateResult;
      try {
        data = JSON.parse(rawBody) as AggregateResult;
      } catch {
        const contentType = response.headers.get("content-type") || "알 수 없음";
        const preview = rawBody.replace(/\s+/g, " ").trim().slice(0, 180);
        data = {
          ok: false,
          error: `HTTP ${response.status} 응답이 JSON이 아닙니다. content-type=${contentType}${preview ? ` · ${preview}` : ""}`,
        };
      }
      setResult(data);
      if (!response.ok) setError(data.error || `HTTP ${response.status}`);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : String(requestError);
      setError(message);
      setResult({ ok: false, error: message });
    } finally {
      setRunning(false);
    }
  }

  async function copyJson(target: CopyTarget, value: unknown) {
    const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
    if (!text) return;
    try {
      await copyToClipboard(text);
      setError(null);
      setCopiedTarget(target);
      window.setTimeout(() => setCopiedTarget((current) => (current === target ? null : current)), 1600);
    } catch (copyError) {
      setError(copyError instanceof Error ? `클립보드 복사에 실패했습니다: ${copyError.message}` : "클립보드 복사에 실패했습니다.");
    }
  }

  async function copyResult() {
    await copyJson("all", formatted);
  }

  return (
    <AdminPageShell
      eyebrow="DAILY INDICATORS"
      title="일봉 탐지 통합 진단"
      description="일봉 돌파·MFI·DMI·MACD·OBV 결과를 한 번에 실행하고 JSON 전체를 복사합니다."
    >
      <section className={styles.policyCard}>
        <div>
          <h2>데이터 기준</h2>
          <p>일봉 캐시 갱신은 KST 당일을 제외한 과거 일봉만 DB에 저장합니다. 각 결과의 원본 JSON에서 종목별 진단과 실패 사유를 확인할 수 있습니다.</p>
        </div>
        <div className={styles.toolbar}>
          <label>
            <span>돌파 검사 제한</span>
            <input value={breakoutLimit} onChange={(event) => setBreakoutLimit(event.target.value.replace(/[^0-9]/g, ""))} placeholder="전체" inputMode="numeric" />
          </label>
          <label>
            <span>응답 모드</span>
            <select value={responseMode} onChange={(event) => setResponseMode(event.target.value === "summary" ? "summary" : "full")}>
              <option value="full">전체 JSON</option>
              <option value="summary">요약 JSON (빠름)</option>
            </select>
          </label>
          <button className={styles.primaryButton} onClick={() => void runAll()} disabled={running}>
            <Play size={16} />
            {running ? "5개 API 실행 중…" : "전체 일봉 API 실행"}
          </button>
          <button className={styles.secondaryButton} onClick={() => void copyResult()} disabled={!formatted}>
            <Copy size={16} />
            {copiedTarget === "all" ? "복사 완료" : "전체 JSON 복사"}
          </button>
        </div>
      </section>

      {error && <div className={styles.error}>{error}</div>}

      {result && (
        <>
          <section className={styles.summaryGrid} aria-label="일봉 API 실행 요약">
            {MODULES.map((module) => {
              const moduleResult = result.results?.[module.key];
              return (
                <article key={module.key} className={styles.summaryCard}>
                  <div className={styles.summaryTop}><h2>{module.label}</h2><span className={moduleResult?.ok ? styles.success : styles.failure}>{moduleResult?.ok ? "정상" : "실패"}</span></div>
                  <p>{module.description}</p>
                  <strong>{countQualified(moduleResult)}개 후보 · {countResults(moduleResult)}개 결과</strong>
                  <button
                    className={styles.cardCopyButton}
                    onClick={() => void copyJson(module.key, moduleResult)}
                    disabled={!moduleResult}
                    type="button"
                  >
                    <Copy size={14} />
                    {copiedTarget === module.key ? "복사 완료" : `${module.label} JSON 복사`}
                  </button>
                </article>
              );
            })}
          </section>

          <section className={styles.outputCard}>
            <div className={styles.outputHeader}>
              <div><h2>통합 결과 JSON</h2><p>{result.checkedAt || "완료 시각 없음"} · {result.durationMs ?? "-"}ms</p></div>
              <button className={styles.secondaryButton} onClick={() => void copyResult()}><Copy size={16} />{copiedTarget === "all" ? "복사 완료" : "JSON 복사"}</button>
            </div>
            <pre>{formatted}</pre>
          </section>

          {result.results && <section className={styles.details} aria-label="기능별 결과">
            {MODULES.map((module) => <details key={module.key}><summary>{module.label} · 원본 결과 펼치기</summary><pre>{JSON.stringify(result.results?.[module.key], null, 2)}</pre></details>)}
          </section>}
        </>
      )}
    </AdminPageShell>
  );
}
