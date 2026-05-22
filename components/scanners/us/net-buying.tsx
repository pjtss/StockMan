"use client";

import { useEffect, useState } from "react";
import type { NetBuyingItem } from "@/lib/kis-us";
import styles from "../scanner.module.css";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";

export function UsNetBuying() {
  const [items, setItems] = useState<NetBuyingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/stock/us/net-buying", { cache: "no-store" });
        
        const debugStatus = res.headers.get("x-debug-status");
        const debugReason = res.headers.get("x-debug-reason");
        if (debugStatus === "empty" || debugStatus === "error") {
          console.warn(`🚨 [KIS-US-DEBUG] 미국 SEC 내부자 매수 데이터 없음 감지! 상태: [${debugStatus}], 원인: ${debugReason}`);
        } else {
          console.info(`⚡ [KIS-US-DEBUG] 미국 SEC 내부자 매수 로드 성공: ${debugReason}`);
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
        미국 SEC 내부자 매수 & 블록딜
        <span>Form 4 Insider Purchases</span>
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
                <span className={styles.highlight}>내부자 {item.foreignNetBuy} | 블록딜 {item.instNetBuy}</span>
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
