"use client";

import { useEffect, useState } from "react";
import styles from "@/app/admin/page.module.css";

type ScheduleKey = "dart" | "us_trading_intensity" | "domestic_trading_intensity" | "us_top_rising";
type Schedule = { startTime: string; endTime: string };

export function AdminScannerSchedules() {
  const [schedules, setSchedules] = useState<Record<ScheduleKey, Schedule> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/scanner-schedules", { cache: "no-store" });
    if (!res.ok) throw new Error("스캐너 시간을 불러오지 못했습니다.");
    const data = await res.json();
    setSchedules(data.schedules);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function save(key: ScheduleKey, next: Schedule) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/scanner-schedules", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, ...next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "스캐너 시간 저장 실패");
      }
      setSchedules((prev) => (prev ? { ...prev, [key]: next } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  if (!schedules) {
    return <main className={styles.page}><section className={styles.shell}><p>불러오는 중...</p>{error && <p>{error}</p>}</section></main>;
  }

  const rows: Array<[ScheduleKey, string]> = [
    ["dart", "DART"],
    ["us_trading_intensity", "미국 체결강도"],
    ["domestic_trading_intensity", "국내 체결강도"],
    ["us_top_rising", "미국 상승률 TOP N"],
  ];

  return (
    <main className={styles.page}>
      <section className={styles.shell}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>ADMIN SCHEDULE</p>
            <h1 className={styles.title}>스캐너 동작 시간 설정</h1>
            <p className={styles.subtitle}>KST 기준 시작 시간과 종료 시간을 각각 저장합니다.</p>
          </div>
        </div>

        {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

        <section className={styles.statusGrid}>
          {rows.map(([key, label]) => (
            <article key={key} className={styles.card}>
              <h2 className={styles.cardTitle}>{label}</h2>
              <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>시작 시간</span>
                  <input
                    type="time"
                    defaultValue={schedules[key].startTime}
                    onBlur={(e) => void save(key, { ...schedules[key], startTime: e.target.value })}
                    style={{ minHeight: 42, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }}
                  />
                </label>
                <label style={{ display: "grid", gap: 6 }}>
                  <span style={{ color: "#cbd5e1", fontWeight: 700, fontSize: 13 }}>종료 시간</span>
                  <input
                    type="time"
                    defaultValue={schedules[key].endTime}
                    onBlur={(e) => void save(key, { ...schedules[key], endTime: e.target.value })}
                    style={{ minHeight: 42, borderRadius: 12, padding: "0 12px", background: "rgba(15,23,42,.88)", color: "#fff", border: "1px solid rgba(148,163,184,.22)" }}
                  />
                </label>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>저장 시 즉시 DB에 반영됩니다.</p>
              </div>
            </article>
          ))}
        </section>

        {loading && <div className={`${styles.alert}`}>저장 중...</div>}
      </section>
    </main>
  );
}
