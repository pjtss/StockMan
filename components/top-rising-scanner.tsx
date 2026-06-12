"use client";

import { useEffect, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import styles from "@/app/scanners/top-rising/page.module.css";

interface TopRisingItem {
  company: string;
  code: string;
  changeRate: string;
  price: string;
  addedAt: string;
}

export function TopRisingScanner({ current = "top-rising" }: { current?: "top-rising" | "us-top-rising" } = {}) {
  const [stocks, setStocks] = useState<TopRisingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);

  const fetchStocks = async (isAuto = false) => {
    try {
      if (!isAuto && stocks.length === 0) setLoading(true);
      setError(null);
      const res = await fetch("/api/stock/top-rising");
      const debugStatus = res.headers.get("x-debug-status");
      const debugReason = res.headers.get("x-debug-reason");

      if (debugStatus === "empty" || debugStatus === "error") setIsFallback(false);
      else if (debugStatus === "fallback") setIsFallback(true);
      else setIsFallback(false);

      if (!res.ok) throw new Error(debugReason || "데이터를 가져오는 중 오류가 발생했습니다.");
      const data = await res.json();
      setStocks(data);
    } catch (err) {
      if (!isAuto) setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      if (!isAuto) setLoading(false);
    }
  };

  const handleAutoSync = async () => {
    try {
      const res = await fetch("/api/stock/top-rising/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success) await fetchStocks(true);
      }
    } catch {}
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/stock/top-rising/sync", { method: "POST" });
      if (!res.ok) throw new Error("동기화 API 호출 중 오류가 발생했습니다.");
      const data = await res.json();
      if (data.success) await fetchStocks(false);
      else throw new Error(data.error || "동기화 실패");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchStocks();
    const interval = setInterval(() => {
      void handleAutoSync();
    }, GLOBAL_POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className={styles.page}>
      <PageNavigation current={current} />
      <div className={styles.container}>
        <div className={styles.headerArea}>
          <div className={styles.titleGroup}>
            <p className={styles.kicker}>LIVE QUANT TERMINAL</p>
            <h1>한국 상승률 상위 N개 스캐너</h1>
            <p className={styles.subtitle}>국내 주식 상승률 상위 종목을 60초마다 모니터링하고 DB에 저장/갱신합니다.</p>
          </div>
          <div className={styles.actions}>
            <div className={styles.autoRefreshBadge}><span className={styles.pulseDot}></span><span>60초 자동 갱신 중</span></div>
            <button className={styles.syncBtn} onClick={handleManualSync} disabled={loading || syncing}>
              {syncing ? "⚡ 동기화 중..." : "🔄 실시간 수동 갱신"}
            </button>
          </div>
        </div>

        {isFallback && <div className={styles.warningAlert} style={{ background: "rgba(234, 179, 8, 0.1)", border: "1px solid rgba(234, 179, 8, 0.2)", color: "#eab308", padding: "12px 16px", borderRadius: "12px", fontWeight: "bold" }}>실시간 KIS API 장애 상태입니다. 현재 표시되는 데이터는 최종 캐시 데이터입니다.</div>}
        {error && <div className={styles.errorAlert}>⚠️ ERROR: {error}</div>}

        {loading ? <div className={styles.loaderArea}><div className={styles.loaderPulse}></div><p>실시간 프리미엄 데이터를 분석하는 중...</p></div> : stocks.length === 0 ? <div className={styles.emptyArea}><p>표시할 데이터가 없습니다.</p><p className={styles.emptyDesc}>수동 갱신 버튼을 누르거나 장중 스케줄러가 동작할 때까지 기다려 주세요.</p></div> : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>종목명</th>
                  <th>등락률</th>
                  <th>현재가</th>
                  <th>DB 진입시각 (서울)</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => (
                  <tr key={stock.code} className={styles.row}>
                    <td className={styles.rankCell}><span className={`${styles.rankBadge} ${i < 3 ? styles.topThree : ""}`}>{i + 1}</span></td>
                    <td className={styles.companyCell}>{stock.company}</td>
                    <td className={`${styles.rateCell} ${parseFloat(stock.changeRate) >= 0 ? styles.up : styles.down}`}>{stock.changeRate}</td>
                    <td className={styles.priceCell}>{stock.price}</td>
                    <td className={styles.timeCell}>{new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", month: "2-digit", day: "2-digit", hour12: false }).format(new Date(stock.addedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
