"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/page.module.css";

type ScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising";
type Schedule = { startTime: string; endTime: string };
type HistoryRow = { key: ScheduleKey; startTime: string; endTime: string; updatedAt: string };

const rows: Array<[ScheduleKey, string, string]> = [
  ["dart", "DART", "00:00 - 23:59"],
  ["us_trading_intensity", "미국 체결강도", "17:00 - 02:00"],
  ["domestic_trading_intensity", "국내 체결강도", "08:00 - 15:30"],
  ["us_top_rising", "미국 상승률 TOP N", "17:00 - 02:00"],
];

const presets: Record<string, Record<ScheduleKey, Schedule>> = {
  default: {
    dart: { startTime: "00:00", endTime: "23:59" },
    us_trading_intensity: { startTime: "17:00", endTime: "02:00" },
    domestic_trading_intensity: { startTime: "08:00", endTime: "15:30" },
    us_top_rising: { startTime: "17:00", endTime: "02:00" },
  },
  allDay: {
    dart: { startTime: "00:00", endTime: "23:59" },
    us_trading_intensity: { startTime: "00:00", endTime: "23:59" },
    domestic_trading_intensity: { startTime: "00:00", endTime: "23:59" },
    us_top_rising: { startTime: "00:00", endTime: "23:59" },
  },
};

export function AdminScannerSchedules() {
  const [schedules, setSchedules] = useState<Record<ScheduleKey, Schedule> | null>(null);
  const [drafts, setDrafts] = useState<Record<ScheduleKey, Schedule> | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<ScheduleKey | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const dirty = useMemo(() => {
    if (!schedules || !drafts) return false;
    return rows.some(([key]) => schedules[key].startTime !== drafts[key].startTime || schedules[key].endTime !== drafts[key].endTime);
  }, [schedules, drafts]);

  async function loadSchedules() {
    const res = await fetch("/api/admin/scanner-schedules", { cache: "no-store" });
    if (res.status === 401) throw new Error("관리자 로그인이 필요합니다.");
    if (!res.ok) throw new Error("스케줄을 불러오지 못했습니다.");
    const data = await res.json();
    setSchedules(data.schedules);
    setDrafts(data.schedules);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/scanner-schedules/history", { cache: "no-store" });
      if (res.status === 401) throw new Error("관리자 로그인이 필요합니다.");
      if (!res.ok) throw new Error("변경 이력을 불러오지 못했습니다.");
      const data = await res.json();
      setHistory(data.history || []);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadSchedules().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  function validateTime(value: string) {
    return /^\d{2}:\d{2}$/.test(value);
  }

  async function save(key: ScheduleKey, next: Schedule) {
    setSaving(key);
    setError(null);
    try {
      if (!validateTime(next.startTime) || !validateTime(next.endTime)) {
        throw new Error("시작/종료 시간은 HH:MM 형식이어야 합니다.");
      }
      const res = await fetch("/api/admin/scanner-schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, ...next }),
      });
      if (res.status === 401) {
        throw new Error("관리자 로그인이 필요합니다.");
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "스캐너 시간 저장 실패");
      }
      setSchedules((prev) => (prev ? { ...prev, [key]: next } : prev));
      setDrafts((prev) => (prev ? { ...prev, [key]: next } : prev));
      setModalOpen(false);
      if (historyOpen) await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(null);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    setModalOpen(false);
    await loadHistory().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  if (!schedules || !drafts) {
    return <main className={styles.page}><section className={styles.shell}><p>불러오는 중...</p>{error && <p>{error}</p>}</section></main>;
  }

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN SCHEDULE</p>
            <h1 className={styles.title}>스캐너 동작 시간 설정</h1>
            <p className={styles.subtitle}>KST 기준 시작 시간과 종료 시간을 수정합니다. 변경 이력은 버튼 클릭 시에만 조회합니다.</p>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <h2 className={styles.cardTitle}>컨트롤</h2>
              <p className={styles.cardDesc}>변경은 모달에서만 합니다.</p>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className={styles.toggleButton} onClick={() => setModalOpen(true)}>시간 수정</button>
              <button className={styles.toggleButton} onClick={() => void openHistory()}>변경 이력</button>
            </div>
          </div>
        </section>

        {modalOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.72)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
            <div style={{ width: "min(100%, 860px)", background: "rgba(15,23,42,.98)", border: "1px solid rgba(148,163,184,.18)", borderRadius: 20, padding: 24, maxHeight: "85vh", overflow: "auto" }}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>스케줄 수정</h2>
                  <p className={styles.cardDesc}>저장 시 DB에 반영됩니다.</p>
                </div>
                <button className={styles.logoutButton} onClick={() => setModalOpen(false)}>닫기</button>
              </div>

              <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button className={styles.toggleButton} onClick={() => {
                    const next = presets.default;
                    setDrafts(next);
                  }}>기본값</button>
                  <button className={styles.toggleButton} onClick={() => {
                    const next = presets.allDay;
                    setDrafts(next);
                  }}>전체 허용</button>
                </div>

                <section className={styles.statusGrid}>
                  {rows.map(([key, label, defaultHint]) => {
                    const current = drafts[key];
                    const status = (() => {
                      const now = new Date();
                      const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
                      const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
                      const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
                      const currentMin = hour * 60 + minute;
                      const start = Number(current.startTime.slice(0, 2)) * 60 + Number(current.startTime.slice(3, 5));
                      const end = Number(current.endTime.slice(0, 2)) * 60 + Number(current.endTime.slice(3, 5));
                      return start <= end ? currentMin >= start && currentMin < end : currentMin >= start || currentMin < end;
                    })();
                    return (
                      <article key={key} className={styles.card}>
                        <div className={styles.cardHeader}>
                          <div>
                            <h2 className={styles.cardTitle}>{label}</h2>
                            <p className={styles.cardDesc}>기본: {defaultHint}</p>
                          </div>
                          <span className={`${styles.state} ${status ? styles.on : styles.off}`}>{status ? "동작 중" : "비동작"}</span>
                        </div>
                        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                          <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>시작 시간</span>
                            <input type="time" value={current.startTime} onChange={(e) => setDrafts((prev) => prev ? { ...prev, [key]: { ...prev[key], startTime: e.target.value } } : prev)} style={{ minHeight: 42, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }} />
                          </label>
                          <label style={{ display: "grid", gap: 6 }}>
                            <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>종료 시간</span>
                            <input type="time" value={current.endTime} onChange={(e) => setDrafts((prev) => prev ? { ...prev, [key]: { ...prev[key], endTime: e.target.value } } : prev)} style={{ minHeight: 42, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }} />
                          </label>
                          <button className={styles.toggleButton} disabled={saving !== null || !dirty} onClick={() => void save(key, current)}>
                            {saving === key ? "저장 중..." : "저장"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              </div>
            </div>
          </div>
        )}

        {historyOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,.72)", display: "grid", placeItems: "center", padding: 20, zIndex: 50 }}>
            <div style={{ width: "min(100%, 860px)", background: "rgba(15,23,42,.98)", border: "1px solid rgba(148,163,184,.18)", borderRadius: 20, padding: 24, maxHeight: "85vh", overflow: "auto" }}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>변경 이력</h2>
                  <p className={styles.cardDesc}>이 모달을 열 때만 DB에서 조회합니다.</p>
                </div>
                <button className={styles.logoutButton} onClick={() => setHistoryOpen(false)}>닫기</button>
              </div>

              {historyLoading ? (
                <p style={{ color: "#cbd5e1", marginTop: 16 }}>불러오는 중...</p>
              ) : (
                <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
                  {(history || []).map((row, index) => (
                    <div key={`${row.key}-${row.updatedAt}-${index}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 12, background: "rgba(15,23,42,.55)", border: "1px solid rgba(255,255,255,.06)" }}>
                      <div>
                        <strong style={{ color: "#f8fafc" }}>{row.key}</strong>
                        <div style={{ color: "#94a3b8", fontSize: 13 }}>{row.startTime} - {row.endTime}</div>
                      </div>
                      <div style={{ color: "#94a3b8", fontSize: 13 }}>{new Date(row.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false })}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
