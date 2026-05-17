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
        {sectors.map((sector) => (
          <div 
            key={sector.name} 
            className={styles.cell}
            style={{ 
              backgroundColor: `rgba(0, 112, 243, ${0.1 + (sector.strength / 100) * 0.9})`,
              opacity: sector.count === 0 ? 0.3 : 1
            }}
          >
            <span className={styles.name}>{sector.name}</span>
            <span className={styles.count}>{sector.count}건</span>
            <div className={styles.barWrap}>
               <div className={styles.bar} style={{ width: `${sector.strength}%` }}></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
