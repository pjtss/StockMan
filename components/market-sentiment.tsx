"use client";

import styles from "./market-sentiment.module.css";

interface MarketSentimentProps {
  score: number; // 0 to 100
  label: string;
}

export function MarketSentiment({ score, label }: MarketSentimentProps) {
  const rotation = (score / 100) * 180 - 90; // -90 to 90 degrees

  return (
    <div className={styles.container}>
      <div className={styles.gauge}>
        <div className={styles.track}></div>
        <div 
          className={styles.fill} 
          style={{ transform: `rotate(${rotation}deg)` }}
        ></div>
        <div className={styles.center}>
          <span className={styles.score}>{Math.round(score)}</span>
          <span className={styles.label}>{label}</span>
        </div>
      </div>
      <div className={styles.labels}>
        <span>BEARISH</span>
        <span>NEUTRAL</span>
        <span>BULLISH</span>
      </div>
    </div>
  );
}
