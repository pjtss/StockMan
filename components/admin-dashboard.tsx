"use client";

import { useState } from "react";
import styles from "@/app/admin/page.module.css";

type AdminDashboardProps = { loggedIn: boolean };

export function AdminDashboard({ loggedIn }: AdminDashboardProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
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
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!loggedIn) {
    return (
      <main className={styles.loginShell}>
        <section className={styles.loginCard}>
          <p className={styles.loginKicker}>ADMIN ACCESS</p>
          <h1 className={styles.loginTitle}>관리자 로그인</h1>
          <form onSubmit={handleLogin} className={styles.loginForm}>
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

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN CONTROL CENTER</p>
            <h1 className={styles.title}>관리자 대시보드</h1>
            <p className={styles.subtitle}>KIS 설정, 스케줄, 기능 ON/OFF를 별도 페이지로 분리해 관리합니다.</p>
          </div>
          <div className={styles.actions}>
            <a href="/admin/features" className={styles.primaryLink}>
              기능 ON/OFF
            </a>
            <a href="/admin/api-config" className={styles.secondaryLink}>
              API 설정
            </a>
            <a href="/admin/api-tests" className={styles.secondaryLink}>
              KIS 테스트
            </a>
            <a href="/admin/schedules" className={styles.secondaryLink}>
              스케줄 설정
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
