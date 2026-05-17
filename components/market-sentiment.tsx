import { useEffect, useState } from "react";
import { getSentimentHistory, addSentimentSnapshot } from "@/lib/sentiment";
import type { SentimentSnapshot } from "@/lib/sentiment";
import styles from "./market-sentiment.module.css";

interface MarketSentimentProps {
  score: number; // 0 to 100
  label: string;
}

export function MarketSentiment({ score, label }: MarketSentimentProps) {
  const rotation = (score / 100) * 180 - 90; // -90 to 90 degrees
  const [history, setHistory] = useState<SentimentSnapshot[]>([]);

  useEffect(() => {
    addSentimentSnapshot(score);
    setHistory(getSentimentHistory());
  }, [score]);

  // Sparkline path calculation
  const getPath = () => {
    if (history.length < 2) return "";
    const width = 200;
    const height = 30;
    const step = width / (history.length - 1);
    
    return history.map((p, i) => {
      const x = i * step;
      const y = height - (p.score / 100) * height;
      return `${i === 0 ? "M" : "L"} ${x} ${y}`;
    }).join(" ");
  };

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
      
      <div className={styles.historyWrap}>
        <div className={styles.sparkline}>
          <svg width="100%" height="30" viewBox="0 0 200 30" preserveAspectRatio="none">
            <path 
              d={getPath()} 
              fill="none" 
              stroke="var(--primary-color, #0070f3)" 
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className={styles.historyLabel}>24H TREND</span>
      </div>

      <div className={styles.labels}>
        <span>BEARISH</span>
        <span>NEUTRAL</span>
        <span>BULLISH</span>
      </div>
    </div>
  );
}
