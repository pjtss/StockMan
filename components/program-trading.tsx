"use client";

import { useEffect, useState } from "react";
import styles from "./program-trading.module.css";

type TabType = "intensity" | "volume" | "buying" | "program";

export function ProgramTradingTracker() {
  const [activeTab, setActiveTab] = useState<TabType>("program");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchData() {
    setLoading(true);
    try {
      let endpoint = "/api/stock/program-trading";
      if (activeTab === "intensity") endpoint = "/api/stock/intensity";
      else if (activeTab === "volume") endpoint = "/api/stock/volume-spike";
      else if (activeTab === "buying") endpoint = "/api/stock/net-buying";

      const res = await fetch(endpoint);
      if (!res.ok) throw new Error("데이터 조회 실패");
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "수급 분석 데이터를 로드할 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [activeTab]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <span className={styles.kicker}>REAL-TIME QUANT SCANNER</span>
          <h3 className={styles.title}>실시간 메이저 수급 스캐너</h3>
        </div>
        <button className={styles.refreshBtn} onClick={fetchData} disabled={loading}>
          {loading ? "..." : "🔄"}
        </button>
      </div>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "program" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("program")}
        >
          🤖 프로그램
        </button>
        <button
          className={`${styles.tab} ${activeTab === "buying" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("buying")}
        >
          🏢 외인/기관
        </button>
        <button
          className={`${styles.tab} ${activeTab === "volume" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("volume")}
        >
          💥 거래폭발
        </button>
        <button
          className={`${styles.tab} ${activeTab === "intensity" ? styles.activeTab : ""}`}
          onClick={() => setActiveTab("intensity")}
        >
          ⚡ 체결강도
        </button>
      </div>

      <div className={styles.body}>
        {error && <div className={styles.error}>{error}</div>}
        {loading && data.length === 0 ? (
          <div className={styles.loading}>수급 데이터를 동기화하는 중...</div>
        ) : (
          <div className={styles.list}>
            {data.map((item, index) => {
              let metricText = "";
              let highlight = false;

              if (activeTab === "program") {
                metricText = `순매수 ${item.programNetBuy}`;
                highlight = item.programNetBuy.startsWith("+");
              } else if (activeTab === "buying") {
                metricText = `외인 ${item.foreignNetBuy} | 기관 ${item.instNetBuy}`;
                highlight = true;
              } else if (activeTab === "volume") {
                metricText = `대비 ${item.volumeRatio} (${item.tradingValue})`;
                highlight = true;
              } else if (activeTab === "intensity") {
                metricText = `강도 ${item.intensity}%`;
                highlight = item.intensity > 100;
              }

              return (
                <div key={item.code || index} className={styles.row}>
                  <div className={styles.rankCol}>
                    <span className={`${styles.rank} ${index < 3 ? styles.topRank : ""}`}>{item.rank}</span>
                  </div>
                  <div className={styles.infoCol}>
                    <span className={styles.company}>{item.company}</span>
                    <span className={styles.code}>{item.code}</span>
                  </div>
                  <div className={styles.priceCol}>
                    <span className={styles.price}>{item.price}원</span>
                    <span className={`${styles.rate} ${item.changeRate.startsWith("+") ? styles.up : styles.down}`}>
                      {item.changeRate}
                    </span>
                  </div>
                  <div className={styles.metricCol}>
                    <span className={`${styles.metric} ${highlight ? styles.highlight : ""}`}>{metricText}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
