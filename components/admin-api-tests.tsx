"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type Result = {
  ok?: boolean;
  status?: number;
  [key: string]: unknown;
};

type TestKey = "us_updown" | "us_price_detail" | "us_turnover" | "us_intensity" | "us_top_rising" | "us_turnover_ratio" | "us_turnover_watch" | "sec_raw";
type ApiTestDefinition = {
  key: TestKey;
  label: string;
  description: string;
  endpoint: string;
  query: string;
};

const TESTS: ApiTestDefinition[] = [
  {
    key: "us_updown",
    label: "미국 상승률 TOP N",
    description: "KIS 해외주식 상승률 순위 원본 응답",
    endpoint: "/api/admin/kis-us-test",
    query: "excd=NAS",
  },
  {
    key: "us_price_detail",
    label: "미국 현재가 상세",
    description: "시가총액·거래대금·시가·고가 원본 응답",
    endpoint: "/api/admin/kis-us-price-detail-test",
    query: "code=TOPS&market=AMS",
  },
  {
    key: "us_turnover",
    label: "해외 거래대금 추이",
    description: "해외주식 분봉 기반 거래대금 응답",
    endpoint: "/api/stock/us/turnover-trend",
    query: "code=AAPL&market=NAS",
  },
  {
    key: "us_intensity",
    label: "미국 체결강도",
    description: "미국 체결강도 랭킹 응답",
    endpoint: "/api/stock/us/intensity",
    query: "",
  },
  {
    key: "us_top_rising",
    label: "미국 상승률 스캐너",
    description: "상승률 TOP N 스캐너 가공 응답",
    endpoint: "/api/stock/top-rising",
    query: "",
  },
  {
    key: "us_turnover_ratio",
    label: "시총 대비 거래대금 스캐너",
    description: "미국 상승률 TOP 100 중 시총 대비 거래대금 1~10% 필터 응답",
    endpoint: "/api/admin/us-turnover-ratio-test",
    query: "",
  },
  {
    key: "us_turnover_watch",
    label: "특정 종목 거래대금 감시",
    description: "등록 티커의 NAS·AMS·NYS 상세 API와 계산 결과",
    endpoint: "/api/admin/us-turnover-watch-test",
    query: "",
  },
  {
    key: "sec_raw",
    label: "SEC 원문 AI",
    description: "SEC 원문 파싱 및 AI 평가 응답",
    endpoint: "/api/admin/sec-raw-test",
    query: "",
  },
];

export function AdminApiTests() {
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TestKey | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState<TestKey | null>(null);
  const [secUrl, setSecUrl] = useState("https://www.sec.gov/");
  const [priceDetailCode, setPriceDetailCode] = useState("TOPS");
  const [priceDetailMarket, setPriceDetailMarket] = useState("AMS");

  async function runTest(test: ApiTestDefinition) {
    setRunning(test.key);
    setError(null);
    try {
      const query = test.key === "sec_raw"
        ? `url=${encodeURIComponent(secUrl)}`
        : test.key === "us_price_detail"
          ? `code=${encodeURIComponent(priceDetailCode)}&market=${encodeURIComponent(priceDetailMarket)}`
          : test.query;
      const response = await fetch(`${test.endpoint}${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "API 테스트 호출에 실패했습니다.");
      setResult(data);
      setActive(test.key);
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : String(testError));
    } finally {
      setRunning(null);
    }
  }

  const activeTest = TESTS.find((test) => test.key === active);

  return (
    <AdminPageShell
      eyebrow="DIAGNOSTICS"
      title="API 테스트"
      description="외부 API와 스캐너 엔드포인트를 수동 실행하고 원본 응답을 모달에서 확인합니다."
    >
      {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

      <section className={styles.statusGrid} aria-label="API 테스트 목록">
        {TESTS.map((test) => {
          const isRunning = running === test.key;
          return (
            <article key={test.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{test.label}</h2>
                  <p className={styles.cardDesc}>{test.description}</p>
                </div>
                <span className={`${styles.state} ${isRunning ? styles.on : styles.off}`}>
                  {isRunning ? "실행 중" : "대기"}
                </span>
              </div>

              {test.key === "sec_raw" && (
                <label className={styles.inlineField}>
                  <span className={styles.fieldLabel}>SEC 원문 URL</span>
                  <input
                    className={styles.textInput}
                    value={secUrl}
                    onChange={(event) => setSecUrl(event.target.value)}
                    placeholder="https://www.sec.gov/Archives/edgar/data/..."
                  />
                </label>
              )}
              {test.key === "us_price_detail" && (
                <div className={styles.fieldGrid}>
                  <label className={styles.inlineField}>
                    <span className={styles.fieldLabel}>종목코드</span>
                    <input className={styles.textInput} value={priceDetailCode} onChange={(event) => setPriceDetailCode(event.target.value.toUpperCase())} placeholder="TOPS" />
                  </label>
                  <label className={styles.inlineField}>
                    <span className={styles.fieldLabel}>거래소</span>
                    <select className={styles.textInput} value={priceDetailMarket} onChange={(event) => setPriceDetailMarket(event.target.value)}>
                      <option value="AMS">AMS</option>
                      <option value="NAS">NAS</option>
                      <option value="NYSE">NYSE</option>
                    </select>
                  </label>
                </div>
              )}

              <div className={styles.cardActions}>
                <button
                  className={styles.toggleButton}
                  onClick={() => void runTest(test)}
                  disabled={running !== null || (test.key === "sec_raw" && !secUrl.trim()) || (test.key === "us_price_detail" && !priceDetailCode.trim())}
                >
                  <Play size={16} />
                  {isRunning ? "호출 중" : "실행"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {result && activeTest && (
        <AdminModal
          title={activeTest.label}
          description="요청 정보와 원본 응답"
          onClose={() => {
            setActive(null);
            setResult(null);
          }}
          wide
        >
          <div className={styles.resultHeader}>
            <span>HTTP 상태</span>
            <strong className={result.ok === false ? styles.resultError : styles.resultSuccess}>
              {String(result.status ?? "완료")}
            </strong>
          </div>
          {Boolean(activeTest.key === "us_turnover_ratio" && result.debug && typeof result.debug === "object") && (
            <div className={styles.resultHeader}>
              <span>필터링 흐름</span>
              <strong>{String((result.debug as any).sourceCount ?? 0)}개 TOP 100 → price-detail {String((result.debug as any).priceDetailSuccessCount ?? 0)}건 성공 → 최종 {Array.isArray((result as any).filtered) ? (result as any).filtered.length : 0}개</strong>
            </div>
          )}
          <pre className={styles.codeBlock}>{JSON.stringify(result, null, 2)}</pre>
        </AdminModal>
      )}
    </AdminPageShell>
  );
}
