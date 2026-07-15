"use client";

import { useEffect, useState } from "react";
import { Clock3, History, RotateCcw, Save } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { AdminPageShell } from "@/components/admin-page-shell";
import { isWithinSchedule } from "@/lib/schedule-time";
import styles from "@/app/admin/page.module.css";

type ScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising" | "us_turnover_ratio";
type Schedule = { startTime: string; endTime: string };
type HistoryRow = { key: ScheduleKey; startTime: string; endTime: string; updatedAt: string };

const rows: Array<[ScheduleKey, string, string]> = [
  ["dart", "DART", "00:00 - 23:59"],
  ["us_trading_intensity", "미국 체결강도", "17:00 - 02:00"],
  ["domestic_trading_intensity", "국내 체결강도", "08:00 - 15:30"],
  ["us_top_rising", "미국 상승률 TOP N", "17:00 - 02:00"],
  ["us_turnover_ratio", "시총 대비 거래대금 스캐너", "17:00 - 02:00"],
];

const labels = Object.fromEntries(rows.map(([key, label]) => [key, label])) as Record<ScheduleKey, string>;

const presets: Record<"default" | "allDay", Record<ScheduleKey, Schedule>> = {
  default: {
    dart: { startTime: "00:00", endTime: "23:59" },
    us_trading_intensity: { startTime: "17:00", endTime: "02:00" },
    domestic_trading_intensity: { startTime: "08:00", endTime: "15:30" },
    us_top_rising: { startTime: "17:00", endTime: "02:00" },
    us_turnover_ratio: { startTime: "17:00", endTime: "02:00" },
  },
  allDay: {
    dart: { startTime: "00:00", endTime: "23:59" },
    us_trading_intensity: { startTime: "00:00", endTime: "23:59" },
    domestic_trading_intensity: { startTime: "00:00", endTime: "23:59" },
    us_top_rising: { startTime: "00:00", endTime: "23:59" },
    us_turnover_ratio: { startTime: "00:00", endTime: "23:59" },
  },
};

export function AdminScannerSchedules() {
  const [schedules, setSchedules] = useState<Record<ScheduleKey, Schedule> | null>(null);
  const [drafts, setDrafts] = useState<Record<ScheduleKey, Schedule> | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ScheduleKey | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function loadSchedules() {
    const response = await fetch("/api/admin/scanner-schedules", { cache: "no-store" });
    if (!response.ok) throw new Error("스케줄을 불러오지 못했습니다.");
    const data = await response.json();
    setSchedules(data.schedules);
    setDrafts(data.schedules);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/admin/scanner-schedules/history", { cache: "no-store" });
      if (!response.ok) throw new Error("변경 이력을 불러오지 못했습니다.");
      const data = await response.json();
      setHistory(data.history || []);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedules().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }, []);

  function updateDraft(key: ScheduleKey, field: keyof Schedule, value: string) {
    setDrafts((current) => current ? { ...current, [key]: { ...current[key], [field]: value } } : current);
  }

  function isDirty(key: ScheduleKey) {
    if (!schedules || !drafts) return false;
    return schedules[key].startTime !== drafts[key].startTime || schedules[key].endTime !== drafts[key].endTime;
  }

  async function saveSchedule(key: ScheduleKey) {
    if (!drafts) return;
    const next = drafts[key];
    setSaving(key);
    setError(null);
    try {
      const response = await fetch("/api/admin/scanner-schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, ...next }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "스케줄 저장에 실패했습니다.");
      setSchedules((current) => current ? { ...current, [key]: next } : current);
      if (historyOpen) await loadHistory();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(null);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setEditorOpen(false);
    await loadHistory().catch((loadError) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
  }

  return (
    <AdminPageShell
      eyebrow="OPERATING HOURS"
      title="스케줄 설정"
      description="KST 기준 시작·종료 시간을 관리합니다. 변경 이력은 요청할 때만 DB에서 조회합니다."
    >
      {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

      {!schedules || !drafts ? (
        <div className={styles.loadingState}>스케줄을 불러오는 중입니다.</div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <button className={styles.toggleButton} onClick={() => setEditorOpen(true)}>
              <Clock3 size={16} />
              시간 수정
            </button>
            <button className={styles.secondaryButton} onClick={() => void openHistory()}>
              <History size={16} />
              변경 이력
            </button>
          </div>

          <section className={styles.scheduleSummary} aria-label="현재 스케줄">
            {rows.map(([key, label]) => {
              const schedule = schedules[key];
              const active = isWithinSchedule(schedule);
              return (
                <div key={key} className={styles.scheduleRow}>
                  <span>
                    <strong>{label}</strong>
                    <small>{schedule.startTime} - {schedule.endTime}</small>
                  </span>
                  <span className={`${styles.state} ${active ? styles.on : styles.off}`}>
                    {active ? "동작 중" : "대기"}
                  </span>
                </div>
              );
            })}
          </section>
        </>
      )}

      {editorOpen && drafts && (
        <AdminModal title="스케줄 수정" description="각 기능의 시간을 개별 저장합니다." onClose={() => setEditorOpen(false)} wide>
          <div className={styles.toolbar}>
            <button className={styles.secondaryButton} onClick={() => setDrafts(structuredClone(presets.default))}>
              <RotateCcw size={16} />
              기본값
            </button>
            <button className={styles.secondaryButton} onClick={() => setDrafts(structuredClone(presets.allDay))}>
              전체 허용
            </button>
          </div>
          <div className={styles.scheduleEditorGrid}>
            {rows.map(([key, label, defaultHint]) => {
              const current = drafts[key];
              const active = isWithinSchedule(current);
              return (
                <section key={key} className={styles.scheduleEditor}>
                  <div className={styles.cardHeader}>
                    <div>
                      <h3 className={styles.cardTitle}>{label}</h3>
                      <p className={styles.cardDesc}>기본 {defaultHint}</p>
                    </div>
                    <span className={`${styles.state} ${active ? styles.on : styles.off}`}>{active ? "동작 중" : "대기"}</span>
                  </div>
                  <div className={styles.timeFields}>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>시작 시간</span>
                      <input className={styles.textInput} type="time" value={current.startTime} onChange={(event) => updateDraft(key, "startTime", event.target.value)} />
                    </label>
                    <label className={styles.fieldGroup}>
                      <span className={styles.fieldLabel}>종료 시간</span>
                      <input className={styles.textInput} type="time" value={current.endTime} onChange={(event) => updateDraft(key, "endTime", event.target.value)} />
                    </label>
                  </div>
                  <button className={styles.toggleButton} disabled={saving !== null || !isDirty(key)} onClick={() => void saveSchedule(key)}>
                    <Save size={16} />
                    {saving === key ? "저장 중" : "저장"}
                  </button>
                </section>
              );
            })}
          </div>
        </AdminModal>
      )}

      {historyOpen && (
        <AdminModal title="스케줄 변경 이력" description="최신 변경부터 표시합니다." onClose={() => setHistoryOpen(false)} wide>
          {historyLoading ? (
            <div className={styles.loadingState}>변경 이력을 불러오는 중입니다.</div>
          ) : history && history.length > 0 ? (
            <div className={styles.historyList}>
              {history.map((row, index) => (
                <div key={`${row.key}-${row.updatedAt}-${index}`} className={styles.historyRow}>
                  <span>
                    <strong>{labels[row.key]}</strong>
                    <small>{row.startTime} - {row.endTime}</small>
                  </span>
                  <time>{new Date(row.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</time>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>변경 이력이 없습니다.</div>
          )}
        </AdminModal>
      )}
    </AdminPageShell>
  );
}
