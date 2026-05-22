"use client";

import { useEffect, useState } from "react";
import type { BidAskRatioItem } from "@/lib/kis-us";
import styles from "../scanner.module.css";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";

export function UsBidAskRatio() {
  const [items, setItems] = useState<BidAskRatioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stock/us/bid-ask-ratio", { cache: "no-store" });
        
        const debugStatus = res.headers.get("x-debug-status");
        const debugReason = res.headers.get("x-debug-reason");
        if (debugStatus === "empty" || debugStatus === "error") {
          console.warn(`🚨 [KIS-US-DEBUG] 나스닥 호가 잔량 비율 데이터 없음 감지! 상태: [${debugStatus}], 원인: ${debugReason}`);
        } else {
          console.info(`⚡ [KIS-US-DEBUG] 나스닥 호가 잔량 비율 로드 성공: ${debugReason}`);
        }

        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!cancelled) {
          setItems(data);
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    void load();
    const interval = setInterval(load, GLOBAL_POLLING_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <article className={styles.container}>
      <h3 className={styles.title}>
        나스닥 호가 잔량 매수 비율 (VR)
        <span>NASDAQ Bid-Ask Vol Ratio</span>
      </h3>
      
      {loading ? (
        <div className={styles.loading}>불러오는 중...</div>
      ) : error ? (
        <div className={styles.error}>데이터를 불러올 수 없습니다</div>
      ) : (
        <div className={styles.list}>
          {items.slice(0, 5).map((item) => (
            <div key={item.code} className={styles.item}>
              <span className={styles.rank}>{item.rank}</span>
              <div className={styles.info}>
                <span className={styles.name}>{item.company} <span className={styles.tickerBadge}>{item.code}</span></span>
                <span className={styles.highlight}>매수비율 {item.bidAskRatio}%</span>
              </div>
              <div className={styles.priceInfo}>
                <span className={styles.price}>{item.price}</span>
                <span className={item.changeRate?.startsWith("+") ? styles.up : styles.down}>
                  {item.changeRate}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
