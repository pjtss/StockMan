"use client";

import { useEffect, useState } from "react";
import type { FeatureModuleKey } from "@/lib/feature-modules";
import styles from "./feature-module-run-history.module.css";

type Run = { id: number; status: string; startedAt: string; finishedAt: string | null; errorMessage: string | null; summary: Record<string, unknown> };

export function FeatureModuleRunHistory({ moduleKey }: { moduleKey: FeatureModuleKey }) {
  const [runs, setRuns] = useState<Run[]>([]);
  useEffect(() => { void fetch(`/api/admin/feature-modules/${moduleKey}/runs`, { cache: "no-store" }).then((response) => response.json()).then((data) => setRuns(data.runs || [])).catch(() => undefined); }, [moduleKey]);
  return <section className={styles.panel}><div className={styles.heading}><div><h2>최근 실행 이력</h2><p>공통 자동화 실행 상태와 오류를 확인합니다.</p></div><button onClick={() => window.location.reload()}>새로고침</button></div>{runs.length === 0 ? <p className={styles.empty}>아직 실행 이력이 없습니다.</p> : <div className={styles.list}>{runs.map((run) => <div className={styles.row} key={run.id}><div><strong>{run.status}</strong><span>{new Date(run.startedAt).toLocaleString("ko-KR")}</span></div><div>{run.errorMessage || `${Object.entries(run.summary || {}).map(([key, value]) => `${key}: ${String(value)}`).join(" · ") || "요약 없음"}`}</div></div>)}</div>}</section>;
}
