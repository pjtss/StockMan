"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import styles from "@/app/admin/observability/observability.module.css";
type Snapshot = { summary: { requests: number; users: number; errors: number }; users: Array<{ userKey: string; count: number; ip: string }>; recent: Array<{ id: number; method: string; path: string; statusCode: number | null; userKey: string; ip: string; userAgent: string; createdAt: string }> };
export function UserActivityDashboard() {
  const [data, setData] = useState<Snapshot | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [selected, setSelected] = useState("");
  async function load(userKey = selected) { setLoading(true); setError(""); try { const query = userKey ? `&userKey=${encodeURIComponent(userKey)}` : ""; const response = await fetch(`/api/admin/user-activity?hours=24${query}`, { cache: "no-store" }); if (!response.ok) throw new Error(); setData(await response.json()); } catch { setError("행동 로그를 불러오지 못했습니다."); } finally { setLoading(false); } }
  useEffect(() => { void load(""); }, []);
  if (loading && !data) return <p className={styles.empty}>행동 로그를 불러오는 중입니다.</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return null;
  return <section className={styles.container}><header className={styles.toolbar}><div><strong>{selected ? `사용자 ${selected}` : "최근 24시간"}</strong><p>사용자 키를 선택하면 해당 사용자의 행동 이력을 확인할 수 있습니다.</p></div><button className={styles.refreshButton} onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> 새로고침</button></header><div className={styles.grid}><article className={styles.card}><h2>전체 요청</h2><strong>{data.summary.requests.toLocaleString()}건</strong></article><article className={styles.card}><h2>식별 사용자 키</h2><strong>{data.summary.users.toLocaleString()}명</strong></article><article className={styles.card}><h2>오류 응답</h2><strong>{data.summary.errors.toLocaleString()}건</strong></article></div><article className={styles.card}><h2>사용자별 행동</h2>{data.users.map((row) => <button type="button" key={row.userKey} className={styles.preview} onClick={() => { setSelected(row.userKey); void load(row.userKey); }}>{row.userKey} · {row.count}회 · {row.ip}</button>)}</article><article className={styles.card}><h2>최근 행동{selected ? ` · ${selected}` : ""}</h2>{data.recent.slice(0, 100).map((row) => <p key={row.id} className={styles.preview}>{new Date(row.createdAt).toLocaleString("ko-KR")} · {row.method} {row.path} · {row.ip} · {row.userAgent} · {row.statusCode ?? "-"}</p>)}</article></section>;
}
