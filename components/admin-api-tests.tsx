"use client";

import { useState } from "react";
import styles from "@/app/admin/page.module.css";

type Result = {
  ok: boolean;
  status: number;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  response: {
    rawText: string;
    parsed: unknown;
  };
};

type TestKey = "us_updown" | "us_turnover" | "us_intensity" | "us_top_rising" | "sec_raw";

const TESTS: Array<{ key: TestKey; label: string; description: string; endpoint: string; query: string }> = [
  {
    key: "us_updown",
    label: "미국 상승률 TOP N",
    description: "KIS 해외주식 상승률 순위를 바로 호출합니다.",
    endpoint: "/api/admin/kis-us-test",
    query: "excd=NAS",
  },
  {
    key: "us_turnover",
    label: "해외 거래대금 추이",
    description: "분봉 조회 기반 거래대금 추이 응답을 확인합니다.",
    endpoint: "/api/stock/us/turnover-trend",
    query: "code=AAPL&market=NAS",
  },
  {
    key: "us_intensity",
    label: "미국 체결강도",
    description: "미국 체결강도 랭킹 응답을 확인합니다.",
    endpoint: "/api/stock/us/intensity",
    query: "",
  },
  {
    key: "us_top_rising",
    label: "미국 상승률 TOP N 스캐너",
    description: "실제 상승률 TOP N 스캐너 API 응답을 확인합니다.",
    endpoint: "/api/stock/top-rising",
    query: "",
  },
  {
    key: "sec_raw",
    label: "SEC 원문 AI 테스트",
    description: "SEC 링크를 넣으면 원문 HTML과 AI용 텍스트를 함께 확인합니다.",
    endpoint: "/api/admin/sec-raw-test",
    query: "url=https://www.sec.gov/",
  },
];

function Modal({ title, result, onClose }: { title: string; result: Result; onClose: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(10px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 1000,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          width: "100%",
          maxWidth: 980,
          maxHeight: "90vh",
          overflow: "auto",
          borderRadius: 20,
          border: "1px solid rgba(148, 163, 184, 0.16)",
          background: "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(2, 6, 23, 0.98))",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.45)",
          padding: 18,
        }}
      >
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>API TEST RESULT</p>
            <h2 className={styles.title} style={{ fontSize: 26, marginTop: 4 }}>
              {title}
            </h2>
          </div>
          <button className={styles.logoutButton} onClick={onClose}>
            닫기
          </button>
        </div>
        <div className={styles.card} style={{ display: "grid", gap: 12 }}>
          <div className={styles.cardHeader}>
            <div>
              <h3 className={styles.cardTitle}>응답 상태</h3>
              <p className={styles.cardDesc}>요청 정보와 원문 응답을 모달 안에만 표시합니다.</p>
            </div>
            <span className={`${styles.state} ${result.ok ? styles.on : styles.off}`}>{result.status}</span>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              borderRadius: 12,
              overflowX: "auto",
              background: "rgba(2, 6, 23, 0.9)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#e2e8f0",
              fontSize: 13,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "60vh",
            }}
          >
{JSON.stringify(result, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function AdminApiTests() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [active, setActive] = useState<TestKey | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState<TestKey | null>(null);
  const [secUrl, setSecUrl] = useState("https://www.sec.gov/");

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "로그인에 실패했습니다.");
      }
      setLoggedIn(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function runTest(test: (typeof TESTS)[number]) {
    setRunning(test.key);
    setError(null);
    try {
      const query = test.key === "sec_raw" ? `url=${encodeURIComponent(secUrl)}` : test.query;
      const res = await fetch(`${test.endpoint}${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "API 테스트 호출에 실패했습니다.");
      }
      setResult(data);
      setActive(test.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggedIn(false);
  }

  if (!loggedIn) {
    return (
      <main className={styles.loginShell}>
        <section className={styles.loginCard}>
          <p className={styles.loginKicker}>ADMIN ACCESS</p>
          <h1 className={styles.loginTitle}>API 테스트 로그인</h1>
          <form onSubmit={login} className={styles.loginForm}>
            <input
              className={styles.passwordInput}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="관리자 비밀번호"
            />
            <button className={styles.submitButton} type="submit" disabled={loading}>
              {loading ? "로그인 중..." : "로그인"}
            </button>
            {error && <p className={`${styles.alert} ${styles.error}`}>{error}</p>}
          </form>
        </section>
      </main>
    );
  }

  const activeTest = TESTS.find((test) => test.key === active) || null;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN API TESTS</p>
            <h1 className={styles.title}>API 테스트 페이지</h1>
            <p className={styles.subtitle}>버튼으로 호출하고, 결과는 모달로만 확인합니다.</p>
          </div>
          <div className={styles.actions}>
            <a href="/admin" className={styles.secondaryLink}>
              대시보드
            </a>
            <button className={styles.logoutButton} onClick={logout}>
              로그아웃
            </button>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.statusGrid}>
          {TESTS.map((test) => (
            <article key={test.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{test.label}</h2>
                  <p className={styles.cardDesc}>{test.description}</p>
                </div>
                <span className={`${styles.state} ${running === test.key ? styles.on : styles.off}`}>
                  {running === test.key ? "실행 중" : "대기"}
                </span>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className={styles.toggleButton} onClick={() => void runTest(test)} disabled={!!running}>
                  실행
                </button>
              </div>
              {test.key === "sec_raw" && (
                <label style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 700 }}>SEC 원문 URL</span>
                  <input
                    value={secUrl}
                    onChange={(e) => setSecUrl(e.target.value)}
                    placeholder="SEC 공시 원문 URL"
                    style={{
                      minHeight: 48,
                      borderRadius: 12,
                      padding: "0 14px",
                      border: "1px solid rgba(148, 163, 184, 0.22)",
                      background: "rgba(15, 23, 42, 0.88)",
                      color: "#f8fafc",
                    }}
                  />
                </label>
              )}
            </article>
          ))}
        </section>

        {result && activeTest && <Modal title={activeTest.label} result={result} onClose={() => setActive(null)} />}
      </section>
    </main>
  );
}
