"use client";

import { useState } from "react";
import { Play, RotateCcw, Send } from "lucide-react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type SecTestResult = {
  ok?: boolean;
  status?: number;
  request?: {
    method?: string;
    url?: string;
    originalUrl?: string;
  };
  urlInfo?: {
    canonicalUrl?: string;
    cik?: string;
    accessionNumber?: string;
    accessionCompact?: string;
    documentFile?: string;
    directoryUrl?: string;
  };
  document?: {
    aiTextLength?: number;
    promptText?: string;
    metadata?: {
      documentType?: string;
      registrantName?: string;
      tradingSymbol?: string;
      reportDate?: string;
      accessionNumber?: string;
    };
    events?: Array<{
      type?: string;
      item?: string;
      title?: string;
      text?: string;
    }>;
  };
  aiEvaluation?: {
    skipped?: boolean;
    reason?: string;
    model?: string;
    evaluation?: {
      level?: string;
      fundamentalScore?: number | null;
      catalystScore?: number | null;
      shortTermImpactScore?: number | null;
      longTermImpactScore?: number | null;
      confidence?: number | null;
      noveltyScore?: number | null;
      surpriseScore?: number | null;
      alreadyPricedInRisk?: number | null;
      materialityScore?: number | null;
      summary?: string;
      facts?: string[];
      inferences?: string[];
      unknowns?: string[];
      eventRisks?: string[];
      analysisLimitations?: string[];
      marketImpact?: string;
      requiresMarketData?: boolean;
      recommendedNextChecks?: string[];
      timeHorizon?: {
        immediate?: string;
        shortTerm?: string;
        longTerm?: string;
      };
    };
  };
};

const DEFAULT_SEC_URL =
  "https://www.sec.gov/Archives/edgar/data/1730168/000119312526295589/d84378d8k.htm?utm_source=chatgpt.com";

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className={styles.dataField}>
      <p>{label}</p>
      <strong>{value ?? "-"}</strong>
    </div>
  );
}

function ListBlock({ title, items }: { title: string; items?: string[] }) {
  return (
    <div className={styles.listBlock}>
      <h3>{title}</h3>
      {items && items.length > 0 ? (
        <ul>
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>표시할 항목이 없습니다.</p>
      )}
    </div>
  );
}

export function AdminSecApiRunner() {
  const [secUrl, setSecUrl] = useState(DEFAULT_SEC_URL);
  const [loading, setLoading] = useState(false);
  const [sendingDiscord, setSendingDiscord] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SecTestResult | null>(null);

  async function runSecTest() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/sec-raw-test?url=${encodeURIComponent(secUrl)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "SEC API 호출에 실패했습니다.");
      }
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function buildDiscordResultPayload(source: SecTestResult) {
    return {
      request: source.request,
      urlInfo: source.urlInfo,
      document: {
        metadata: source.document?.metadata,
        events: source.document?.events,
      },
      aiEvaluation: source.aiEvaluation,
    };
  }

  async function sendDiscord() {
    if (!result) return;
    setSendingDiscord(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/sec-discord", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ result: buildDiscordResultPayload(result) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Discord 전송에 실패했습니다.");
      }
      setNotice("Discord 전송이 완료됐습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSendingDiscord(false);
    }
  }

  const metadata = result?.document?.metadata;
  const evaluation = result?.aiEvaluation?.evaluation;

  return (
    <AdminPageShell
      eyebrow="SEC ANALYSIS"
      title="SEC 공시 분석 테스트"
      description="SEC 원문 파싱, 이벤트 구조화, AI 평가, Discord 전송을 한 건씩 검증합니다."
    >

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}
        {notice && <div className={`${styles.alert} ${styles.on}`}>{notice}</div>}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>SEC 원문 URL</h2>
              <p className={styles.cardDesc}>공식 SEC Archives HTML URL만 허용됩니다.</p>
            </div>
            <span className={`${styles.state} ${loading ? styles.on : styles.off}`}>{loading ? "실행 중" : "대기"}</span>
          </div>
          <div className={styles.controlStack}>
            <input
              className={styles.textInput}
              value={secUrl}
              onChange={(e) => setSecUrl(e.target.value)}
              placeholder="https://www.sec.gov/Archives/edgar/data/..."
            />
            <div className={styles.toolbar}>
              <button className={styles.toggleButton} onClick={() => void runSecTest()} disabled={loading || !secUrl.trim()}>
                <Play size={16} />
                {loading ? "분석 중..." : "SEC API 실행"}
              </button>
              <button className={styles.toggleButton} onClick={() => void sendDiscord()} disabled={!result || loading || sendingDiscord}>
                <Send size={16} />
                {sendingDiscord ? "Discord 전송 중..." : "Discord로 결과 전송"}
              </button>
              <button className={styles.logoutButton} onClick={() => setSecUrl(DEFAULT_SEC_URL)} disabled={loading}>
                <RotateCcw size={16} />
                Broadcom 예시 입력
              </button>
            </div>
          </div>
        </section>

        {result && (
          <>
            <section className={styles.statusGrid}>
              <Field label="HTTP Status" value={result.status} />
              <Field label="Original URL" value={result.request?.originalUrl} />
              <Field label="Canonical URL" value={result.urlInfo?.canonicalUrl} />
              <Field label="CIK" value={result.urlInfo?.cik} />
              <Field label="Accession" value={result.urlInfo?.accessionNumber} />
              <Field label="Document File" value={result.urlInfo?.documentFile} />
            </section>

            <section className={styles.statusGrid}>
              <Field label="Company" value={metadata?.registrantName} />
              <Field label="Ticker" value={metadata?.tradingSymbol} />
              <Field label="Form" value={metadata?.documentType} />
              <Field label="Report Date" value={metadata?.reportDate} />
              <Field label="AI Text Length" value={result.document?.aiTextLength} />
              <Field label="AI Model" value={result.aiEvaluation?.model || (result.aiEvaluation?.skipped ? "skipped" : "-")} />
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>Parsed Events</h2>
                  <p className={styles.cardDesc}>Parser Router가 생성한 공통 이벤트 구조입니다.</p>
                </div>
                <span className={`${styles.state} ${result.document?.events?.length ? styles.on : styles.off}`}>
                  {result.document?.events?.length || 0}
                </span>
              </div>
              <div className={styles.eventList}>
                {(result.document?.events || []).map((event, index) => (
                  <article key={`${event.type}-${index}`} className={styles.eventItem}>
                    <div className={styles.cardHeader}>
                      <div>
                        <h3 className={styles.cardTitle}>{event.title || `Event ${index + 1}`}</h3>
                        <p className={styles.cardDesc}>
                          {event.type} {event.item ? `| Item ${event.item}` : ""}
                        </p>
                      </div>
                    </div>
                    <p className={styles.eventText}>{event.text}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>AI Evaluation</h2>
                  <p className={styles.cardDesc}>
                    {result.aiEvaluation?.skipped
                      ? result.aiEvaluation.reason || "AI 평가가 건너뛰어졌습니다."
                      : evaluation?.summary || "AI 평가 요약입니다."}
                  </p>
                </div>
                <span className={`${styles.state} ${result.aiEvaluation?.skipped ? styles.off : styles.on}`}>
                  {result.aiEvaluation?.skipped ? "skipped" : evaluation?.level || "-"}
                </span>
              </div>

              {evaluation && (
                <>
                  <div className={`${styles.statusGrid} ${styles.sectionGap}`}>
                    <Field label="Fundamental" value={evaluation.fundamentalScore} />
                    <Field label="Catalyst" value={evaluation.catalystScore} />
                    <Field label="Short Term" value={evaluation.shortTermImpactScore} />
                    <Field label="Long Term" value={evaluation.longTermImpactScore} />
                    <Field label="Confidence" value={evaluation.confidence} />
                    <Field label="Requires Market Data" value={String(evaluation.requiresMarketData)} />
                  </div>
                  <div className={`${styles.statusGrid} ${styles.sectionGap}`}>
                    <ListBlock title="Facts" items={evaluation.facts} />
                    <ListBlock title="Inferences" items={evaluation.inferences} />
                    <ListBlock title="Unknowns" items={evaluation.unknowns} />
                  </div>
                  <div className={`${styles.statusGrid} ${styles.sectionGap}`}>
                    <ListBlock title="Event Risks" items={evaluation.eventRisks} />
                    <ListBlock title="Analysis Limitations" items={evaluation.analysisLimitations} />
                    <ListBlock title="Recommended Next Checks" items={evaluation.recommendedNextChecks} />
                  </div>
                </>
              )}
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Prompt Text</h2>
              <pre className={`${styles.codeBlock} ${styles.codeBlockPrompt}`}>
                {result.document?.promptText || ""}
              </pre>
            </section>

            <section className={styles.card}>
              <h2 className={styles.cardTitle}>Raw API Result</h2>
              <pre className={`${styles.codeBlock} ${styles.codeBlockTall}`}>
                {JSON.stringify(result, null, 2)}
              </pre>
            </section>
          </>
        )}
    </AdminPageShell>
  );
}
