"use client";

import { useEffect, useState } from "react";
import styles from "@/app/admin/page.module.css";

type FeatureKey = "dart_realtime" | "sec_realtime" | "us_scanners" | "us_turnover_trend";
type FeatureInfo = { key: FeatureKey; label: string; description: string };
type AdminFeatureFlagsProps = { loggedIn: boolean };

export function AdminFeatureFlags({ loggedIn }: AdminFeatureFlagsProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null);
  const [features, setFeatures] = useState<FeatureInfo[]>([]);

  async function loadFlags() {
    const res = await fetch("/api/admin/flags", { cache: "no-store" });
    if (!res.ok) throw new Error("관리자 플래그를 불러오지 못했습니다.");
    const data = await res.json();
    setFlags(data.flags);
    setFeatures(data.features);
  }

  useEffect(() => {
    if (loggedIn) {
      void loadFlags().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [loggedIn]);

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

  async function handleToggle(key: FeatureKey, enabled: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "플래그 저장에 실패했습니다.");
      }
      const data = await res.json();
      setFlags(data.flags);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.reload();
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
            <h1 className={styles.title}>기능 ON/OFF 관리</h1>
            <p className={styles.subtitle}>DART, SEC, 미국 스캐너, 해외 거래대금 추이의 활성 여부를 제어합니다.</p>
          </div>
          <div className={styles.actions}>
            <a
              href="/admin"
              style={{
                minHeight: 48,
                padding: "0 18px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 12,
                border: "1px solid rgba(148, 163, 184, 0.24)",
                background: "rgba(148, 163, 184, 0.12)",
                color: "#e2e8f0",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              대시보드
            </a>
            <button className={styles.logoutButton} onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.statusGrid}>
          {features.map((feature) => {
            const enabled = flags?.[feature.key] ?? false;
            return (
              <article key={feature.key} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2 className={styles.cardTitle}>{feature.label}</h2>
                    <p className={styles.cardDesc}>{feature.description}</p>
                  </div>
                  <span className={`${styles.state} ${enabled ? styles.on : styles.off}`}>
                    {enabled ? "켜짐" : "꺼짐"}
                  </span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button
                    className={styles.toggleButton}
                    onClick={() => void handleToggle(feature.key, !enabled)}
                    disabled={loading}
                  >
                    {enabled ? "끄기" : "켜기"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
