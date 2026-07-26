"use client";
import { useEffect, useState } from "react";
import { DEFAULT_SHORT_BORROW_POLICY } from "@/lib/short-borrow-policy";
import styles from "./feature-module-operations.module.css";
export function ShortBorrowPolicySettings() {
  const [value, setValue] = useState(JSON.stringify(DEFAULT_SHORT_BORROW_POLICY, null, 2));
  const [common, setCommon] = useState({ enabled: true, startTime: "17:00", endTime: "02:00", cooldownSeconds: 60 });
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/admin/feature-modules/us-short-borrow", { cache: "no-store" }).then((r) => r.json()).then((data) => { setValue(JSON.stringify(data.featureSettings?.shortBorrowPolicy || DEFAULT_SHORT_BORROW_POLICY, null, 2)); setCommon({ enabled: Boolean(data.enabled), startTime: data.startTime, endTime: data.endTime, cooldownSeconds: Number(data.cooldownSeconds) }); }).catch(() => undefined); }, []);
  async function save() { try { const shortBorrowPolicy = JSON.parse(value); const response = await fetch("/api/admin/feature-modules/us-short-borrow", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...common, featureSettings: { shortBorrowPolicy } }) }); setMessage(response.ok ? "공매도 점수 기준이 저장되었습니다." : "저장 실패"); } catch { setMessage("JSON 형식이 올바르지 않습니다."); } }
  return <section className={styles.panel}><div><h2>공매도 점수 기준</h2><p>공통 운영 설정과 분리된 공매도 점수 정책입니다.</p></div><textarea rows={15} value={value} onChange={(e) => setValue(e.target.value)} style={{ width: "100%", fontFamily: "monospace" }} /><div className={styles.footer}><span>{message}</span><button onClick={() => void save()}>점수 기준 저장</button></div></section>;
}
