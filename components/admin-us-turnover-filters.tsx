"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminModal } from "@/components/admin-modal";
import styles from "./admin-us-turnover-filters.module.css";

type FilterKey = "maxPrice" | "maxRate" | "maxOpenToHighRate" | "minMarketCap" | "maxMarketCap" | "minTurnoverRatio" | "maxTurnoverRatio" | "tradingValueIncreaseAlert" | "minIntensity" | "minTradingValueRvol" | "minTradingValueIncreaseRate" | "minPersistenceWindows";
type FilterValues = Record<FilterKey, number>;

const DEFAULTS: FilterValues = { maxPrice: 10, maxRate: 30, maxOpenToHighRate: 30, minMarketCap: 1_000_000, maxMarketCap: 100_000_000, minTurnoverRatio: 1, maxTurnoverRatio: 10, tradingValueIncreaseAlert: 20_000, minIntensity: 100, minTradingValueRvol: 2, minTradingValueIncreaseRate: 0.1, minPersistenceWindows: 1 };
const PRESETS: Record<string, FilterValues> = {
  기본: DEFAULTS,
  보수적: { ...DEFAULTS, minTurnoverRatio: 3, tradingValueIncreaseAlert: 50_000, minIntensity: 120, minTradingValueRvol: 3, minTradingValueIncreaseRate: 0.2, minPersistenceWindows: 2 },
  공격적: { ...DEFAULTS, minTurnoverRatio: 0.5, maxTurnoverRatio: 50, tradingValueIncreaseAlert: 10_000, minIntensity: 80, minTradingValueRvol: 1.2, minTradingValueIncreaseRate: 0, minPersistenceWindows: 0 },
};
const fields: Array<{ key: FilterKey; label: string; unit: string; hint: string; step?: string }> = [
  { key: "maxPrice", label: "주가 상한", unit: "USD", hint: "현재 주가가 이 값 미만인 종목만 통과합니다.", step: "0.01" },
  { key: "maxRate", label: "상승률 상한", unit: "%", hint: "현재 상승률이 이 값 미만인 종목만 통과합니다." },
  { key: "maxOpenToHighRate", label: "시가 대비 고점 상한", unit: "%", hint: "시가 대비 고점 상승률의 최대 허용값입니다." },
  { key: "minMarketCap", label: "시총 하한", unit: "달러", hint: "최소 시가총액입니다." },
  { key: "maxMarketCap", label: "시총 상한", unit: "달러", hint: "최대 시가총액입니다." },
  { key: "minTurnoverRatio", label: "시총 대비 거래대금 하한", unit: "%", hint: "당일 거래대금 ÷ 시가총액 × 100의 최소값입니다." },
  { key: "maxTurnoverRatio", label: "시총 대비 거래대금 상한", unit: "%", hint: "당일 거래대금 ÷ 시가총액 × 100의 최대값입니다." },
  { key: "tradingValueIncreaseAlert", label: "거래대금 상승 알림 기준", unit: "달러", hint: "직전 스냅샷 대비 거래대금 증가액 기준입니다." },
  { key: "minIntensity", label: "최소 체결강도", unit: "%", hint: "거래대금 증가 알림에 필요한 최신 체결강도입니다." },
  { key: "minTradingValueRvol", label: "최소 거래대금 RVOL", unit: "x", hint: "직전 거래대금 증가가 평소 증가폭 대비 몇 배인지입니다." },
  { key: "minTradingValueIncreaseRate", label: "최소 거래대금 증가율", unit: "%", hint: "직전 스냅샷 거래대금 대비 증가율입니다." },
  { key: "minPersistenceWindows", label: "3·5분 지속 확인", unit: "개", hint: "3분·5분 창 중 양수 증가를 요구할 창 개수입니다." },
];

function formatMoney(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function AdminUsTurnoverFilters() {
  const [data, setData] = useState<FilterValues>(DEFAULTS);
  const [saved, setSaved] = useState<FilterValues>(DEFAULTS);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/admin/us-turnover-filters", { cache: "no-store" }).then((response) => response.json()).then((value) => {
      const next = { ...DEFAULTS, ...value } as FilterValues;
      setData(next); setSaved(next);
    }).catch(() => setError("현재 설정을 불러오지 못했습니다."));
  }, []);

  const validationError = useMemo(() => {
    if (data.maxPrice <= 0) return "주가 상한은 0보다 커야 합니다.";
    if (data.maxRate < 0 || data.maxOpenToHighRate < 0) return "상승률 기준은 0 이상이어야 합니다.";
    if (data.minMarketCap <= 0 || data.maxMarketCap <= data.minMarketCap) return "시총 상한은 시총 하한보다 커야 합니다.";
    if (data.minTurnoverRatio < 0 || data.maxTurnoverRatio <= data.minTurnoverRatio) return "거래대금 비율 상한은 하한보다 커야 합니다.";
    if (data.tradingValueIncreaseAlert < 0) return "거래대금 상승 기준은 0 이상이어야 합니다.";
    if (data.minIntensity < 0) return "최소 체결강도는 0 이상이어야 합니다.";
    if (data.minTradingValueRvol < 0 || data.minTradingValueIncreaseRate < 0) return "RVOL·증가율은 0 이상이어야 합니다.";
    if (!Number.isInteger(data.minPersistenceWindows) || data.minPersistenceWindows < 0 || data.minPersistenceWindows > 2) return "3·5분 지속 확인은 0~2 사이 정수여야 합니다.";
    return "";
  }, [data]);

  const changed = JSON.stringify(data) !== JSON.stringify(saved);
  async function save() {
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/us-turnover-filters", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error("저장 실패");
      const next = { ...DEFAULTS, ...(await response.json()) } as FilterValues;
      setData(next); setSaved(next); setModalOpen(false); setMessage("필터가 저장되었습니다.");
    } catch { setError("필터 저장에 실패했습니다."); }
    finally { setSaving(false); }
  }

  return <section className={styles.section}>
    <div className={styles.heading}><div><p className={styles.eyebrow}>US TURNOVER RATIO</p><h2>시총 대비 거래대금 필터</h2><p className={styles.description}>필터 값은 달러 기준으로 저장되며, 거래대금 상승 알림은 직전 스냅샷 대비 증가액을 기준으로 판정합니다.</p></div><span className={changed ? styles.dirty : styles.clean}>{changed ? "저장되지 않은 변경" : "적용 중"}</span></div>
    <div className={styles.presetBar}><span>빠른 프리셋</span>{Object.entries(PRESETS).map(([name, values]) => <button type="button" key={name} className={styles.presetButton} onClick={() => setData({ ...values })}>{name}</button>)}</div><div className={styles.grid}>{fields.map((field) => <label className={styles.row} key={field.key}><span className={styles.label}>{field.label}<small>{field.hint}</small></span><span className={styles.inputWrap}><input type="number" min="0" step={field.step || "0.01"} value={data[field.key]} onChange={(event) => setData({ ...data, [field.key]: Number(event.target.value) })} /><em>{field.unit}</em></span></label>)}</div>
    {validationError && <p className={styles.error}>{validationError}</p>}
    {error && <p className={styles.error}>{error}</p>}
    <div className={styles.footer}><span>{message || (changed ? "변경사항을 저장하려면 버튼을 눌러주세요." : "현재 설정이 자동화에 적용 중입니다.")}</span><button className={styles.saveButton} disabled={!changed || Boolean(validationError)} onClick={() => setModalOpen(true)}>필터 저장</button></div>
    {modalOpen && <AdminModal title="필터 설정 저장" description="다음 값으로 자동화 필터를 변경합니다. 저장 후 다음 탐지 주기부터 적용됩니다." onClose={() => !saving && setModalOpen(false)} footer={<><button className={styles.cancelButton} onClick={() => setModalOpen(false)} disabled={saving}>취소</button><button className={styles.confirmButton} onClick={() => void save()} disabled={saving}>{saving ? "저장 중..." : "변경사항 저장"}</button></>}><div className={styles.preview}>{fields.map((field) => <div key={field.key}><span>{field.label}</span><strong>{field.key.includes("MarketCap") || field.key === "tradingValueIncreaseAlert" ? formatMoney(data[field.key]) : `${data[field.key].toLocaleString()}${field.unit === "%" ? "%" : ` ${field.unit}`}`}</strong></div>)}</div></AdminModal>}
  </section>;
}
