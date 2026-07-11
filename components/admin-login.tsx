"use client";

import { useState } from "react";
import { LockKeyhole, LogIn } from "lucide-react";
import styles from "@/app/admin/page.module.css";

export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "로그인에 실패했습니다.");
      window.location.reload();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : String(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginCard}>
        <div className={styles.loginIcon} aria-hidden="true">
          <LockKeyhole size={24} />
        </div>
        <p className={styles.loginKicker}>STOCKMAN ADMIN</p>
        <h1 className={styles.loginTitle}>관리자 로그인</h1>
        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <label className={styles.fieldLabel} htmlFor="admin-password">
            비밀번호
          </label>
          <input
            id="admin-password"
            className={styles.passwordInput}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button className={styles.submitButton} type="submit" disabled={loading}>
            <LogIn size={17} />
            {loading ? "확인 중" : "로그인"}
          </button>
          {error && <p className={`${styles.alert} ${styles.error}`}>{error}</p>}
        </form>
      </section>
    </main>
  );
}
