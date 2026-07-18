"use client";

import { useEffect, useState } from "react";
import { Power } from "lucide-react";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type FeatureKey = "dart_realtime" | "sec_realtime" | "us_scanners" | "us_turnover_trend" | "us_turnover_ratio" | "us_turnover_watch";
type FeatureInfo = { key: FeatureKey; label: string; description: string };

export function AdminFeatureFlags() {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<FeatureKey | null>(null);
  const [flags, setFlags] = useState<Record<FeatureKey, boolean> | null>(null);
  const [features, setFeatures] = useState<FeatureInfo[]>([]);

  async function loadFlags() {
    const response = await fetch("/api/admin/flags", { cache: "no-store" });
    if (!response.ok) throw new Error("관리자 플래그를 불러오지 못했습니다.");
    const data = await response.json();
    setFlags(data.flags);
    setFeatures(data.features);
  }

  useEffect(() => {
    void loadFlags().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  async function toggleFeature(key: FeatureKey, enabled: boolean) {
    setSaving(key);
    setError(null);
    try {
      const response = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, enabled }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "플래그 저장에 실패했습니다.");
      setFlags(data.flags);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(null);
    }
  }

  return (
    <AdminPageShell
      eyebrow="OPERATIONS"
      title="기능 ON/OFF"
      description="수집기, 스캐너, 자동화 파이프라인의 실제 실행 여부를 제어합니다."
    >
      {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

      {!flags ? (
        <div className={styles.loadingState}>기능 상태를 불러오는 중입니다.</div>
      ) : (
        <section className={styles.statusGrid} aria-label="기능 상태">
          {features.map((feature) => {
            const enabled = flags[feature.key];
            const isSaving = saving === feature.key;
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
                <div className={styles.cardActions}>
                  <button
                    className={`${styles.toggleButton} ${enabled ? styles.dangerButton : ""}`}
                    onClick={() => void toggleFeature(feature.key, !enabled)}
                    disabled={saving !== null}
                  >
                    <Power size={16} />
                    {isSaving ? "저장 중" : enabled ? "끄기" : "켜기"}
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </AdminPageShell>
  );
}
