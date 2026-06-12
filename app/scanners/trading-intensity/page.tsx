"use client";

import { useEffect, useState, useCallback } from "react";
import { PageNavigation } from "@/components/page-navigation";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import { ChartModal } from "@/components/chart-modal";
import styles from "./page.module.css";

interface StockIntensityItem {
  company: string;
  code: string;
  intensity: number;
  price: string;
  changeRate: string;
  volume: string;
  tradingValue: string;
  addedAt: string;
}

export default function TradingIntensityScannerPage() {
  const [stocks, setStocks] = useState<StockIntensityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [chartTarget, setChartTarget] = useState<{ code: string; company: string } | null>(null);

  const openChart = useCallback((code: string, company: string) => {
    setChartTarget({ code, company });
  }, []);
  const closeChart = useCallback(() => setChartTarget(null), []);

  const fetchStocks = async (isAuto = false) => {
    try {
      if (!isAuto && stocks.length === 0) {
        setLoading(true);
      }
      setError(null);
      const res = await fetch("/api/stock/intensity");
      
      const debugStatus = res.headers.get("x-debug-status");
      const debugReason = res.headers.get("x-debug-reason");
      
      if (debugStatus === "empty" || debugStatus === "error") {
        console.warn(`🚨 [KIS-DEBUG-CLIENT] 체결강도 TOP 10 데이터 없음 감지! 상태: [${debugStatus}], 원인: ${debugReason}`);
        setIsFallback(false);
      } else if (debugStatus === "fallback") {
        console.warn(`⚠️ [KIS-DEBUG-CLIENT] 체결강도 KIS API 장애에 따른 DB 캐시 폴백 감지! 원인: ${debugReason}`);
        setIsFallback(true);
      } else {
        console.info(`⚡ [KIS-DEBUG-CLIENT] 체결강도 TOP 10 데이터 로드 성공: ${debugReason}`);
        setIsFallback(false);
      }

      if (!res.ok) {
        throw new Error(`데이터를 가져오는 중 오류가 발생했습니다. (원인: ${debugReason || "알 수 없음"})`);
      }
      const data = await res.json();
      setStocks(data);
    } catch (err) {
      console.error(err);
      if (!isAuto) {
        setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      }
    } finally {
      if (!isAuto) {
        setLoading(false);
      }
    }
  };

  const handleAutoSync = async () => {
    try {
      console.info("⚡ [KIS-DEBUG-CLIENT] 체결강도 자동 동기화 60초 주기 요청...");
      const res = await fetch("/api/stock/intensity/sync", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        console.info("⚡ [KIS-DEBUG-CLIENT] 체결강도 자동 동기화 응답:", data);
        if (data.success) {
          await fetchStocks(true);
        }
      }
    } catch (err) {
      console.warn("Failed auto-syncing trading intensity:", err);
    }
  };

  const handleManualSync = async () => {
    try {
      setSyncing(true);
      setError(null);
      console.info("⚡ [KIS-DEBUG-CLIENT] 체결강도 수동 동기화 요청 시작...");
      const res = await fetch("/api/stock/intensity/sync", { method: "POST" });
      if (!res.ok) {
        throw new Error("동기화 API 호출 중 오류가 발생했습니다.");
      }
      const data = await res.json();
      console.info("⚡ [KIS-DEBUG-CLIENT] 체결강도 수동 동기화 완료 응답 수신:", data);
      if (data.success) {
        await fetchStocks(false);
      } else {
        throw new Error(`동기화가 정상 처리되지 않았습니다: ${data.error || "알 수 없는 오류"}`);
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
    const interval = setInterval(() => {
      void handleAutoSync();
    }, GLOBAL_POLLING_INTERVAL);
    return () => clearInterval(interval);
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
      <PageNavigation current="trading-intensity" />

      <div className={styles.container}>
        <div className={styles.headerArea}>
          <div className={styles.titleGroup}>
            <p className={styles.kicker}>LIVE QUANT TERMINAL</p>
            <h1>체결강도 TOP 10 스캐너</h1>
            <p className={styles.subtitle}>
              실시간 국내 주식 체결강도 상위 10개 종목을 60초마다 모니터링하고 DB에 저장/갱신합니다.
            </p>
          </div>
          <div className={styles.actions}>
            <div className={styles.autoRefreshBadge}>
              <span className={styles.pulseDot}></span>
              <span>60초 자동 갱신 중</span>
            </div>
            <button
              className={styles.syncBtn}
              onClick={handleManualSync}
              disabled={loading || syncing}
            >
              {syncing ? "⚡ 동기화 중..." : "🔄 실시간 수동 갱신"}
            </button>
          </div>
        </div>

        {isFallback && (
          <div className={styles.warningAlert} style={{
            background: "rgba(234, 179, 8, 0.1)",
            border: "1px solid rgba(234, 179, 8, 0.2)",
            color: "#eab308",
            padding: "12px 16px",
            borderRadius: "12px",
            marginBottom: "16px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}>
            <span>⚠️ WARNING: 실시간 KIS API 연동 장애 상태입니다. 현재 표시되는 데이터는 최종 캐시(이전 영업일 마감) 데이터입니다.</span>
          </div>
        )}

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
                  <th>종목명 (클릭 → 차트)</th>
                  <th>체결강도</th>
                  <th>현재가</th>
                  <th>등락률</th>
                  <th>누적거래량</th>
                  <th>누적거래대금</th>
                  <th>DB 진입시각 (서울)</th>
                </tr>
              </thead>
              <tbody>
                {stocks.map((stock, i) => {
                  const rateNum = parseFloat(stock.changeRate?.replace(/[+%]/g, "")) || 0;
                  const isUp = rateNum >= 0;
                  return (
                    <tr key={stock.company} className={styles.row}>
                      <td className={styles.rankCell}>
                        <span className={`${styles.rankBadge} ${i < 3 ? styles.topThree : ""}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td
                        className={styles.companyCell}
                        style={{ cursor: "pointer", color: "#00ffa3" }}
                        onClick={() => openChart(stock.code, stock.company)}
                        title="클릭하여 차트 보기"
                      >
                        📈 {stock.company}
                      </td>
                      <td className={styles.intensityCell}>{stock.intensity}%</td>
                      <td className={styles.priceCell}>{stock.price}원</td>
                      <td className={`${styles.rateCell} ${isUp ? styles.up : styles.down}`}>
                        {stock.changeRate}
                      </td>
                      <td className={styles.volumeCell}>{stock.volume}</td>
                      <td className={styles.tradingValueCell}>{stock.tradingValue}</td>
                      <td className={styles.timeCell}>{formatTime(stock.addedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {chartTarget && (
        <ChartModal
          code={chartTarget.code}
          company={chartTarget.company}
          onClose={closeChart}
        />
      )}
    </main>
  );
}
