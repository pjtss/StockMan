"use client";

import { useMemo } from "react";
import { getSectorSentiment } from "@/lib/sectors";
import styles from "./sector-map.module.css";

interface SectorMapProps {
  items: any[];
}

export function SectorMap({ items }: SectorMapProps) {
  const sectors = useMemo(() => getSectorSentiment(items), [items]);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>SECTOR HEATMAP</h3>
      <div className={styles.grid}>
        {sectors.map((sector) => {
          const isHighStrength = sector.strength > 40;
          const bgGradient = isHighStrength
            ? "linear-gradient(135deg, rgba(255, 0, 163, 0.08) 0%, rgba(0, 255, 163, 0.05) 100%)"
            : "linear-gradient(135deg, rgba(0, 112, 243, 0.08) 0%, rgba(255, 255, 255, 0.01) 100%)";
          const borderColor = isHighStrength
            ? "rgba(255, 0, 163, 0.3)"
            : "rgba(255, 255, 255, 0.05)";
          const glowShadow = isHighStrength
            ? "0 0 15px rgba(255, 0, 163, 0.15)"
            : "none";

          return (
            <div 
              key={sector.name} 
              className={styles.cell}
              style={{ 
                background: bgGradient,
                borderColor: borderColor,
                boxShadow: glowShadow,
                opacity: sector.count === 0 ? 0.35 : 1
              }}
            >
              <div className={styles.cellHeader}>
                <span className={styles.name}>{sector.name}</span>
                {isHighStrength && <span className={styles.hotBadge}>🔥 HOT</span>}
              </div>
              <span className={styles.count}>{sector.count}건 (호재율 {sector.strength.toFixed(0)}%)</span>
              <div className={styles.barWrap}>
                 <div 
                   className={styles.bar} 
                   style={{ 
                     width: `${sector.strength}%`,
                     background: isHighStrength
                       ? "linear-gradient(90deg, #ff00a3, #00ffa3)"
                       : "linear-gradient(90deg, #00d4ff, #0070f3)"
                   }}
                 ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
