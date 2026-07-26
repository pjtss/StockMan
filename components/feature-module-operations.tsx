"use client";

import { useEffect, useState } from "react";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import styles from "./feature-module-operations.module.css";

export function FeatureModuleOperations({ moduleKey }: { moduleKey: FeatureModuleKey }) {
  const [settings, setSettings] = useState({ enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 });
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch(`/api/admin/feature-modules/${moduleKey}`, { cache: "no-store" }).then((response) => response.json()).then(setSettings); }, [moduleKey]);
  async function save() { const response = await fetch(`/api/admin/feature-modules/${moduleKey}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) }); setMessage(response.ok ? "공통 운영 설정이 저장되었습니다." : "저장 실패"); }
  return <section className={styles.panel}><div><h2>공통 운영 설정</h2><p>ON/OFF, KST 스케줄, 알림 쿨다운은 모든 기능 모듈에서 공통으로 관리합니다.</p></div><label className={styles.toggle}><input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} /><span>기능 활성화</span></label><div className={styles.fields}><label>시작 시각<input type="time" value={settings.startTime} onChange={(event) => setSettings({ ...settings, startTime: event.target.value })} /></label><label>종료 시각<input type="time" value={settings.endTime} onChange={(event) => setSettings({ ...settings, endTime: event.target.value })} /></label><label>알림 쿨다운(초)<input type="number" min="0" value={settings.cooldownSeconds} onChange={(event) => setSettings({ ...settings, cooldownSeconds: Number(event.target.value) })} /></label></div><div className={styles.footer}><span>{message}</span><button onClick={() => void save()}>공통 설정 저장</button></div></section>;
}
