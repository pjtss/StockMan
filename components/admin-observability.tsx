"use client";
import { useEffect, useState } from "react";

type Run = { id: number; moduleKey: string; status: string; startedAt: string; finishedAt?: string | null; summary?: Record<string, unknown>; errorMessage?: string | null };
type Module = { key: string; label: string; runs: Run[] };

export function AdminObservability() {
  const [modules, setModules] = useState<Module[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { void fetch("/api/debug/automation-runs?limit=10", { cache: "no-store" }).then((r) => r.ok ? r.json() : Promise.reject()).then((v) => setModules(v.modules || [])).catch(() => setError("실행 이력을 불러오지 못했습니다.")); }, []);
  return <section style={{ display: "grid", gap: 16 }}>{error && <p>{error}</p>}{modules.map((module) => <article key={module.key} style={{ border: "1px solid #334155", borderRadius: 12, padding: 16 }}><h2>{module.label}</h2>{module.runs.length === 0 ? <p>실행 이력 없음</p> : <div style={{ display: "grid", gap: 8 }}>{module.runs.map((run) => <div key={run.id} style={{ display: "grid", gap: 4, padding: 8, background: "rgba(15,23,42,.5)", borderRadius: 8 }}><strong>{run.status} · {new Date(run.startedAt).toLocaleString("ko-KR")}</strong>{run.errorMessage && <small>{run.errorMessage}</small>}<pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(run.summary || {}, null, 2)}</pre></div>)}</div>}</article>)}</section>;
}
