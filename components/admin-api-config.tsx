"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { AdminPageShell } from "@/components/admin-page-shell";
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
  const [activeKey, setActiveKey] = useState<KisApiConfigKey | null>(null);
  const [draft, setDraft] = useState<KisApiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadConfigs() {
    const response = await fetch("/api/admin/kis-api-config", { cache: "no-store" });
    if (!response.ok) throw new Error("설정을 불러오지 못했습니다.");
    const data = await response.json();
    setConfigs(data.configs);
  }

  useEffect(() => {
    void loadConfigs().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  function openConfig(key: KisApiConfigKey) {
    if (!configs) return;
    setDraft({ ...configs[key] });
    setActiveKey(key);
  }

  function closeConfig() {
    if (saving) return;
    setActiveKey(null);
    setDraft(null);
  }

  async function saveConfig() {
    if (!activeKey || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/kis-api-config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: activeKey, config: draft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "저장에 실패했습니다.");
      await loadConfigs();
      setActiveKey(null);
      setDraft(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  const activeLabel = useMemo(() => (activeKey ? labels[activeKey] : ""), [activeKey]);

  return (
    <AdminPageShell
      eyebrow="KIS CONFIGURATION"
      title="API 설정"
      description="KIS 요청 헤더와 파라미터를 API 단위로 관리합니다. 민감한 값은 편집 모달에서만 표시됩니다."
    >
      {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

      {!configs ? (
        <div className={styles.loadingState}>API 설정을 불러오는 중입니다.</div>
      ) : (
        <section className={styles.statusGrid} aria-label="KIS API 설정">
          {(Object.keys(labels) as KisApiConfigKey[]).map((key) => (
            <article key={key} className={styles.card}>
              <div>
                <h2 className={styles.cardTitle}>{labels[key]}</h2>
                <p className={styles.cardDesc}>헤더 및 파라미터 설정</p>
              </div>
              <div className={styles.cardActions}>
                <button className={styles.toggleButton} onClick={() => openConfig(key)}>
                  <Settings2 size={16} />
                  수정
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {activeKey && draft && (
        <AdminModal
          title={activeLabel}
          description="변경 사항은 저장 즉시 DB 설정에 반영됩니다."
          onClose={closeConfig}
          wide
          footer={
            <>
              <button className={styles.secondaryButton} onClick={closeConfig} disabled={saving}>취소</button>
              <button className={styles.toggleButton} onClick={() => void saveConfig()} disabled={saving}>
                <Save size={16} />
                {saving ? "저장 중" : "저장"}
              </button>
            </>
          }
        >
          <div className={styles.fieldGrid}>
            {fields.map((field) => (
              <label key={field} className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>{fieldLabels[field] || field}</span>
                <input
                  className={styles.textInput}
                  type={field === "authorization" ? "password" : "text"}
                  value={draft[field] ?? ""}
                  onChange={(event) => setDraft((current) => current ? { ...current, [field]: event.target.value } : current)}
                />
              </label>
            ))}
          </div>
        </AdminModal>
      )}
    </AdminPageShell>
  );
}
