"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/page.module.css";

type KisApiConfigKey = "us_updown_rate" | "us_volume_power";
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

type TopN = { topN: number };

const labels: Record<KisApiConfigKey, string> = {
  us_updown_rate: "미국 상승율/하락율",
  us_volume_power: "미국 체결강도",
};

export function AdminKisSettings() {
  const [configs, setConfigs] = useState<Record<KisApiConfigKey, KisApiConfig> | null>(null);
  const [topN, setTopN] = useState<number>(10);
  const [modal, setModal] = useState<KisApiConfigKey | "topN" | null>(null);
  const [draft, setDraft] = useState<KisApiConfig | null>(null);
  const [topNDraft, setTopNDraft] = useState("10");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [cfgRes, topRes] = await Promise.all([
      fetch("/api/admin/kis-api-config", { cache: "no-store" }),
      fetch("/api/admin/us-top-rising-count", { cache: "no-store" }),
    ]);
    if (!cfgRes.ok || !topRes.ok) throw new Error("설정을 불러오지 못했습니다.");
    const cfgData = await cfgRes.json();
    const topData: TopN = await topRes.json();
    setConfigs(cfgData.configs);
    setTopN(topData.topN);
    setTopNDraft(String(topData.topN));
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const currentKey = useMemo(() => modal && modal !== "topN" ? modal : null, [modal]);

  async function openConfig(key: KisApiConfigKey) {
    if (!configs) return;
    setDraft(configs[key]);
    setModal(key);
  }

  async function saveConfig() {
    if (!currentKey || !draft) return;
    setError(null);
    const res = await fetch("/api/admin/kis-api-config", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: currentKey, config: draft }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "저장 실패");
      return;
    }
    await load();
    setModal(null);
  }

  async function saveTopN() {
    setError(null);
    const res = await fetch("/api/admin/us-top-rising-count", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ topN: Number(topNDraft) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "저장 실패");
      return;
    }
    await load();
    setModal(null);
  }

  if (!configs) return <main className={styles.page}><section className={styles.shell}><p>불러오는 중...</p></section></main>;

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN KIS CONFIG</p>
            <h1 className={styles.title}>KIS 요청 설정</h1>
            <p className={styles.subtitle}>API 헤더와 파라미터는 여기서만 수정합니다.</p>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.statusGrid}>
          {(Object.keys(configs) as KisApiConfigKey[]).map((key) => (
            <article key={key} className={styles.card}>
              <h2 className={styles.cardTitle}>{labels[key]}</h2>
              <p className={styles.cardDesc}>세부값은 모달에서 수정합니다.</p>
              <div style={{ marginTop: 14 }}>
                <button className={styles.toggleButton} onClick={() => void openConfig(key)}>수정</button>
              </div>
            </article>
          ))}
          <article className={styles.card}>
            <h2 className={styles.cardTitle}>미국 상승률 TOP N</h2>
            <p className={styles.cardDesc}>현재 표시 개수: {topN}</p>
            <div style={{ marginTop: 14 }}>
              <button className={styles.toggleButton} onClick={() => setModal("topN")}>N값 수정</button>
            </div>
          </article>
          <article className={styles.card}>
            <h2 className={styles.cardTitle}>시총 대비 거래대금 스캐너</h2>
            <p className={styles.cardDesc}>미국 상승률 API를 TOP 100 기준으로 재사용하며 1~10% 필터를 적용합니다.</p>
            <div style={{ marginTop: 14 }}><button className={styles.toggleButton} onClick={() => void openConfig("us_updown_rate")}>공통 API 설정</button></div>
          </article>
        </section>

        {modal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.72)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
            <div style={{ width: "min(100%, 720px)", background: "rgba(15,23,42,.98)", border: "1px solid rgba(148,163,184,.18)", borderRadius: 20, padding: 24 }}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{modal === "topN" ? "미국 상승률 TOP N" : labels[modal as KisApiConfigKey]}</h2>
                  <p className={styles.cardDesc}>여기서만 수정하고 저장합니다.</p>
                </div>
                <button className={styles.logoutButton} onClick={() => setModal(null)}>닫기</button>
              </div>

              {modal === "topN" ? (
                <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>N 값</span>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={topNDraft}
                      onChange={(e) => setTopNDraft(e.target.value)}
                      style={{ minHeight: 44, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }}
                    />
                  </label>
                  <button className={styles.toggleButton} onClick={() => void saveTopN()}>저장</button>
                </div>
              ) : draft && (
                <div style={{ display: "grid", gap: 12, marginTop: 16, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
                  {(["KEYB","AUTH","EXCD","GUBN","NDAY","VOL_RANG","tr_id","custtype","content_type","authorization"] as const).map((field) => (
                    <label key={field} style={{ display: "grid", gap: 6 }}>
                      <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>{field}</span>
                      <input
                        value={(draft as any)[field] ?? ""}
                        onChange={(e) => setDraft((prev) => prev ? { ...prev, [field]: e.target.value } : prev)}
                        style={{ minHeight: 44, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }}
                      />
                    </label>
                  ))}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10 }}>
                    <button className={styles.toggleButton} onClick={() => void saveConfig()}>저장</button>
                    <button className={styles.logoutButton} onClick={() => setModal(null)}>취소</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
