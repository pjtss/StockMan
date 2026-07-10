"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/page.module.css";

type KisApiConfigKey = "us_updown_rate" | "us_volume_power" | "us_turnover_trend" | "us_price_detail";
type KisApiConfig = {
  KEYB?: string;
  AUTH?: string;
  EXCD: string;
  FID_COND_MRKT_DIV_CODE?: string;
  FID_HOUR_CLS_CODE?: string;
  FID_PW_DATA_INCU_YN?: string;
  GUBN?: string;
  NDAY?: string;
  VOL_RANG?: string;
  tr_id: string;
  custtype: string;
  content_type: string;
  authorization: string;
};

const labels: Record<KisApiConfigKey, string> = {
  us_updown_rate: "미국 상승률 TOP N",
  us_volume_power: "미국 체결강도",
  us_turnover_trend: "해외 거래대금 추이",
  us_price_detail: "AMS 시총 조회",
};

const fieldLabels: Partial<Record<keyof KisApiConfig, string>> = {
  KEYB: "KEYB",
  AUTH: "AUTH",
  EXCD: "EXCD",
  FID_COND_MRKT_DIV_CODE: "FID_COND_MRKT_DIV_CODE",
  FID_HOUR_CLS_CODE: "FID_HOUR_CLS_CODE",
  FID_PW_DATA_INCU_YN: "FID_PW_DATA_INCU_YN",
  GUBN: "GUBN",
  NDAY: "NDAY",
  VOL_RANG: "VOL_RANG",
  tr_id: "tr_id",
  custtype: "custtype",
  content_type: "content_type",
  authorization: "authorization (토큰)",
};

const fields: Array<keyof KisApiConfig> = [
  "KEYB",
  "AUTH",
  "EXCD",
  "FID_COND_MRKT_DIV_CODE",
  "FID_HOUR_CLS_CODE",
  "FID_PW_DATA_INCU_YN",
  "GUBN",
  "NDAY",
  "VOL_RANG",
  "tr_id",
  "custtype",
  "content_type",
  "authorization",
];

export function AdminApiConfig() {
  const [configs, setConfigs] = useState<Record<KisApiConfigKey, KisApiConfig> | null>(null);
  const [modal, setModal] = useState<KisApiConfigKey | null>(null);
  const [draft, setDraft] = useState<KisApiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/kis-api-config", { cache: "no-store" });
    if (!res.ok) throw new Error("설정을 불러오지 못했습니다.");
    const data = await res.json();
    setConfigs(data.configs);
  }

  useEffect(() => {
    if (loggedIn) {
      void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [loggedIn]);

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

  async function openConfig(key: KisApiConfigKey) {
    if (!configs) return;
    setDraft(configs[key]);
    setModal(key);
  }

  async function save() {
    if (!modal || !draft) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/kis-api-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: modal, config: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "저장 실패");
      }
      await load();
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setLoggedIn(false);
  }

  const currentLabel = useMemo(() => (modal ? labels[modal] : ""), [modal]);

  if (!loggedIn) {
    return (
      <main className={styles.loginShell}>
        <section className={styles.loginCard}>
          <p className={styles.loginKicker}>ADMIN ACCESS</p>
          <h1 className={styles.loginTitle}>API 설정 로그인</h1>
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

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN KIS CONFIG</p>
            <h1 className={styles.title}>API 설정 페이지</h1>
            <p className={styles.subtitle}>각 KIS API의 헤더와 파라미터는 버튼 클릭 후 모달에서만 수정합니다.</p>
          </div>
          <div className={styles.actions}>
            <a href="/admin" className={styles.secondaryLink}>대시보드</a>
            <a href="/admin/features" className={styles.secondaryLink}>기능 ON/OFF</a>
            <button className={styles.logoutButton} onClick={logout}>로그아웃</button>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.statusGrid}>
          {(Object.keys(labels) as KisApiConfigKey[]).map((key) => (
            <article key={key} className={styles.card}>
              <h2 className={styles.cardTitle}>{labels[key]}</h2>
              <p className={styles.cardDesc}>기본값은 DB가 없을 때 자동 적용됩니다.</p>
              <div style={{ marginTop: 14 }}>
                <button className={styles.toggleButton} onClick={() => void openConfig(key)}>
                  수정
                </button>
              </div>
            </article>
          ))}
        </section>

        {modal && draft && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.72)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
            <div style={{ width: "min(100%, 840px)", background: "rgba(15,23,42,.98)", border: "1px solid rgba(148,163,184,.18)", borderRadius: 20, padding: 24 }}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{currentLabel}</h2>
                  <p className={styles.cardDesc}>저장은 이 모달에서만 진행합니다.</p>
                </div>
                <button className={styles.logoutButton} onClick={() => setModal(null)}>닫기</button>
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                {fields.map((field) => (
                  <label key={field} style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>{fieldLabels[field] || field}</span>
                    <input
                      type={field === "authorization" ? "password" : "text"}
                      value={(draft as any)[field] ?? ""}
                      onChange={(e) => setDraft((prev) => (prev ? { ...prev, [field]: e.target.value } : prev))}
                      style={{ minHeight: 44, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }}
                    />
                  </label>
                ))}
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                <button className={styles.toggleButton} onClick={() => void save()} disabled={loading}>
                  저장
                </button>
                <button className={styles.logoutButton} onClick={() => setModal(null)}>
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
