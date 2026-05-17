"use client";

import { useEffect, useState } from "react";
import type { StockIntensity } from "@/lib/kis";
import styles from "./trading-intensity.module.css";

export function TradingIntensity() {
  const [items, setItems] = useState<StockIntensity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/stock/intensity");
        if (response.ok) {
          const data = await response.json();
          setItems(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    void load();
    const interval = setInterval(() => void load(), 60000); // 1 minute refresh
    return () => clearInterval(interval);
  }, []);

  if (loading && items.length === 0) {
    return <div className={styles.loading}>체결강도 불러오는 중...</div>;
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>실시간 체결강도 TOP 10</h3>
      <div className={styles.list}>
        {items.slice(0, 10).map((item) => (
          <div key={item.code} className={styles.item}>
            <span className={styles.rank}>{item.rank}</span>
            <div className={styles.info}>
              <span className={styles.name}>{item.company}</span>
              <span className={styles.intensity}>{item.intensity.toFixed(1)}%</span>
            </div>
            <div className={styles.priceInfo}>
              <span className={styles.price}>{item.price}</span>
              <span className={item.changeRate.startsWith("+") ? styles.up : styles.down}>
                {item.changeRate}
              </span>
            </div>
            <div className={styles.barWrap}>
              <div 
                className={styles.bar} 
                style={{ width: `${Math.min(item.intensity, 200) / 2}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
