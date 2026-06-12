"use client";

import { useEffect, useState } from "react";
import styles from "@/app/admin/page.module.css";

type FeatureKey = "dart_realtime" | "sec_realtime" | "us_scanners";
type FeatureInfo = { key: FeatureKey; label: string; description: string };
type KisApiConfig = {
  KEYB: string;
  AUTH: string;
  EXCD: string;
  GUBN?: string;
  NDAY?: string;
  VOL_RANG?: string;
  tr_id: string;
  custtype: string;
  content_type: string;
  authorization: string;
};
type KisApiConfigKey = "us_updown_rate" | "us_volume_power";

type AdminDashboardProps = { loggedIn: boolean };

export function AdminDashboard({ loggedIn }: AdminDashboardProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null);
  const [features, setFeatures] = useState<FeatureInfo[]>([]);
  const [kisConfigs, setKisConfigs] = useState<Record<KisApiConfigKey, KisApiConfig> | null>(null);

  async function loadFlags() {
    const res = await fetch("/api/admin/flags", { cache: "no-store" });
    if (!res.ok) throw new Error("관리자 플래그를 불러오지 못했습니다.");
    const data = await res.json();
    setFlags(data.flags);
    setFeatures(data.features);
  }

  async function loadKisConfigs() {
    const res = await fetch("/api/admin/kis-api-config", { cache: "no-store" });
    if (!res.ok) throw new Error("KIS API 설정을 불러오지 못했습니다.");
    const data = await res.json();
    setKisConfigs(data.configs);
  }

  useEffect(() => {
    if (loggedIn) {
      void Promise.all([loadFlags(), loadKisConfigs()]).catch((err) =>
        setError(err instanceof Error ? err.message : String(err))
      );
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

  async function handleKisConfigChange(key: KisApiConfigKey, nextConfig: KisApiConfig) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kis-api-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, config: nextConfig }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "KIS API 설정 저장에 실패했습니다.");
      }
      const data = await res.json();
      setKisConfigs((prev) => ({
        ...(prev || {}),
        [key]: data.config,
      }) as Record<KisApiConfigKey, KisApiConfig>);
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
            <p className={styles.subtitle}>
              DART, SEC, 미국 스캐너의 실시간 동작 여부를 한 곳에서 제어합니다.
            </p>
          </div>
          <div className={styles.actions}>
            <a
              href="/admin/kis-us-test"
              style={{
                minHeight: 48,
                padding: "0 18px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 12,
                border: "1px solid rgba(59, 130, 246, 0.24)",
                background: "rgba(59, 130, 246, 0.12)",
                color: "#93c5fd",
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 0 18px rgba(59, 130, 246, 0.12)",
              }}
            >
              KIS 테스트
            </a>
            <a
              href="/admin/schedules"
              style={{
                minHeight: 48,
                padding: "0 18px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 12,
                border: "1px solid rgba(16, 185, 129, 0.24)",
                background: "rgba(16, 185, 129, 0.12)",
                color: "#6ee7b7",
                fontWeight: 800,
                textDecoration: "none",
                boxShadow: "0 0 18px rgba(16, 185, 129, 0.12)",
              }}
            >
              스케줄 설정
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

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>KIS API 요청 설정</h2>
              <p className={styles.cardDesc}>
                환경변수로 받는 appkey, appsecret은 제외하고 나머지 헤더/파라미터만 조정합니다. AUTH와 KEYB는 기본값을 빈 문자열로 둡니다.
              </p>
            </div>
          </div>

          {(["us_updown_rate", "us_volume_power"] as const).map((key) => {
            const config = kisConfigs?.[key];
            if (!config) return null;
            const update = (patch: Partial<KisApiConfig>) =>
              void handleKisConfigChange(key, { ...config, ...patch });

            return (
              <div key={key} style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 className={styles.cardTitle} style={{ fontSize: 16 }}>
                  {key === "us_updown_rate" ? "해외주식 상승율/하락율" : "해외주식 체결강도"}
                </h3>
                <div style={{ display: "grid", gap: 12, marginTop: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {[
                    ["KEYB", config.KEYB],
                    ["AUTH", config.AUTH],
                    ["EXCD", config.EXCD],
                    ["GUBN", config.GUBN ?? ""],
                    ["NDAY", config.NDAY ?? ""],
                    ["VOL_RANG", config.VOL_RANG ?? ""],
                    ["tr_id", config.tr_id],
                    ["custtype", config.custtype],
                    ["content_type", config.content_type],
                    ["authorization", config.authorization],
                  ].map(([field, value]) => (
                    <label key={field} style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>{field}</span>
                      <input
                        defaultValue={value}
                        onBlur={(e) => update({ [field]: e.target.value } as Partial<KisApiConfig>)}
                        style={{
                          minHeight: 42,
                          borderRadius: 12,
                          padding: "0 12px",
                          border: "1px solid rgba(148, 163, 184, 0.22)",
                          background: "rgba(15, 23, 42, 0.88)",
                          color: "#f8fafc",
                        }}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </section>
    </main>
  );
}
