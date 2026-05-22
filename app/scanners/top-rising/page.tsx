"use client";

import { useEffect, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import styles from "./page.module.css";

interface TopRisingStock {
  code: string;
  company: string;
  changeRate: string;
  price: string;
  addedAt: string;
}

export default function TopRisingPage() {
  const [stocks, setStocks] = useState<TopRisingStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/stock/top-rising");
      if (!res.ok) {
        throw new Error("데이터를 가져오는 중 오류가 발생했습니다.");
      }
      const data = await res.json();
      setStocks(data);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      const res = await fetch("/api/stock/top-rising/sync", { method: "POST" });
      if (!res.ok) {
        throw new Error("동기화 중 오류가 발생했습니다.");
      }
      const data = await res.json();
      if (data.success) {
        await fetchStocks();
      } else {
        throw new Error("동기화가 정상 처리되지 않았습니다.");
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "동기화에 실패했습니다.");
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    fetchStocks();
  }, []);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return "";
      return new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(date);
    } catch {
      return "";
    }
  };

  return (
    <main className={styles.page}>
      <PageNavigation current="top-rising" />

      <div className={styles.container}>
        <div className={styles.headerArea}>
          <div className={styles.titleGroup}>
            <p className={styles.kicker}>LIVE QUANT TERMINAL</p>
            <h1>상승률 TOP 10 스캐너</h1>
            <p className={styles.subtitle}>
              실시간 국내 주식 상승률 상위 TOP 10 종목을 모니터링하고 DB에 저장/갱신합니다.
            </p>
          </div>
          <button
            className={styles.syncBtn}
            onClick={handleManualSync}
            disabled={loading || syncing}
          >
            {syncing ? "⚡ 동기화 중..." : "🔄 실시간 수동 갱신"}
          </button>
        </div>

        {error && (
          <div className={styles.errorAlert}>
            <span>⚠️ ERROR: {error}</span>
          </div>
        )}

        {loading ? (
          <div className={styles.loaderArea}>
            <div className={styles.loaderPulse}></div>
            <p>실시간 프리미엄 데이터를 분석하는 중...</p>
          </div>
        ) : stocks.length === 0 ? (
          <div className={styles.emptyArea}>
            <p>표시할 데이터가 없습니다.</p>
            <p className={styles.emptyDesc}>수동 갱신 버튼을 누르거나 장중 스케줄러가 동작할 때까지 기다려 주세요.</p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>순위</th>
                  <th>종목명</th>
                  <th>코드</th>
                  <th>현재가</th>
                  <th>상승률</th>
                  <th>DB 진입시각 (서울)</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => {
                  const rateNum = parseFloat(stock.changeRate.replace(/[+%]/g, "")) || 0;
                  const isUp = rateNum >= 0;
                  return (
                    <tr key={stock.code} className={styles.row}>
                      <td className={styles.rankCell}>
                        <span className={`${styles.rankBadge} ${i < 3 ? styles.topThree : ""}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className={styles.companyCell}>{stock.company}</td>
                      <td className={styles.codeCell}>{stock.code}</td>
                      <td className={styles.priceCell}>{stock.price}원</td>
                      <td className={`${styles.rateCell} ${isUp ? styles.up : styles.down}`}>
                        {stock.changeRate}
                      </td>
                      <td className={styles.timeCell}>{formatTime(stock.addedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
