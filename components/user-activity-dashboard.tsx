"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import styles from "@/app/admin/observability/observability.module.css";

type Snapshot = { hours: number; summary: { requests: number; users: number; ips: number; errors: number }; paths: Array<{ path: string; method: string; count: number; errors: number }>; users: Array<{ userKey: string; count: number; lastSeen: string; ip: string; userAgent: string }>; recent: Array<{ id: number; requestId: string; method: string; path: string; statusCode: number | null; userKey: string; createdAt: string }> };

export function UserActivityDashboard() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  async function load() { setLoading(true); setError(""); try { const response = await fetch("/api/admin/user-activity?hours=24", { cache: "no-store" }); if (!response.ok) throw new Error(); setData(await response.json()); } catch { setError("행동 로그를 불러오지 못했습니다."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);
  if (loading && !data) return <p className={styles.empty}>행동 로그를 불러오는 중입니다.</p>;
  if (error) return <p className={styles.error}>{error}</p>;
  if (!data) return null;
  return <section className={styles.container}><header className={styles.toolbar}><div><strong>최근 24시간</strong><p>서버에 저장된 요청 로그 기준입니다. 원본 IP는 관리자 화면에만 표시됩니다.</p></div><button className={styles.refreshButton} onClick={() => void load()} disabled={loading}><RefreshCw size={15} /> 새로고침</button></header><div className={styles.grid}><article className={styles.card}><h2>전체 요청</h2><strong>{data.summary.requests.toLocaleString()}건</strong></article><article className={styles.card}><h2>식별 사용자 키</h2><strong>{data.summary.users.toLocaleString()}명</strong></article><article className={styles.card}><h2>오류 응답</h2><strong>{data.summary.errors.toLocaleString()}건</strong></article></div><div className={styles.grid}><article className={styles.card}><h2>인기 경로</h2>{data.paths.slice(0,10).map((row) => <p key={`${row.method}-${row.path}`} className={styles.preview}>{row.method} {row.path} · {row.count}건{row.errors ? ` · 오류 ${row.errors}` : ""}</p>)}</article><article className={styles.card}><h2>최근 사용자</h2>{data.users.slice(0,10).map((row) => <p key={row.userKey} className={styles.preview}>{row.userKey} · {row.count}회 · {row.ip}</p>)}</article></div><article className={styles.card}><h2>최근 행동</h2>{data.recent.slice(0,20).map((row) => <p key={row.id} className={styles.preview}>{new Date(row.createdAt).toLocaleString("ko-KR")} · {row.method} {row.path} · {row.userKey} · {row.statusCode ?? "-"}</p>)}</article></section>;
}
