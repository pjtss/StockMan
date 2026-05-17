"use client";

import { formatTime } from "@/lib/utils";
import styles from "./company-timeline.module.css";

interface CompanyTimelineProps {
  company: string;
  items: any[];
  onClose: () => void;
}

export function CompanyTimeline({ company, items, onClose }: CompanyTimelineProps) {
  const companyItems = items
    .filter(item => item.company === company)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h2>{company} 공시 타임라인</h2>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </header>
        <div className={styles.content}>
          {companyItems.length > 0 ? (
            <div className={styles.timeline}>
              {companyItems.map((item, i) => (
                <div key={item.link || i} className={styles.item}>
                  <div className={styles.dot}></div>
                  <div className={styles.line}></div>
                  <div className={styles.time}>{formatTime(item.publishedAt)}</div>
                  <div className={styles.details}>
                    <span className={styles.judgment}>{item.judgment || item.sentiment}</span>
                    <a href={item.link} target="_blank" rel="noreferrer" className={styles.title}>
                      {item.title}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>해당 종목의 데이터가 없습니다.</p>
          )}
        </div>
      </div>
    </div>
  );
}
