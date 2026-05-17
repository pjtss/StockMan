import { useEffect, useState } from "react";
import { formatTime } from "@/lib/utils";
import styles from "./company-timeline.module.css";

interface CompanyTimelineProps {
  company: string;
  items: any[];
  onClose: () => void;
}

export function CompanyTimeline({ company, items, onClose }: CompanyTimelineProps) {
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadHistory() {
      setLoading(true);
      try {
        const response = await fetch(`/api/dart/history?company=${encodeURIComponent(company)}`);
        if (!response.ok) throw new Error("공시 히스토리 로드 실패");
        const data = await response.json();
        setTimelineItems(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "히스토리를 불러올 수 없습니다.");
        // Fallback to local session items if API fails
        const filtered = items.filter(item => item.company === company);
        setTimelineItems(filtered);
      } finally {
        setLoading(false);
      }
    }
    loadHistory();
  }, [company, items]);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <div>
            <span className={styles.kicker}>HISTORICAL TIMELINE</span>
            <h2>{company} 공시 역사 타임라인 (1년)</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>&times;</button>
        </header>
        <div className={styles.content}>
          {loading ? (
            <div className={styles.loading}>DB에서 공시 연대기를 집계하는 중...</div>
          ) : error && timelineItems.length === 0 ? (
            <p className={styles.empty}>{error}</p>
          ) : timelineItems.length > 0 ? (
            <div className={styles.timeline}>
              {timelineItems.map((item, i) => (
                <div key={item.link || i} className={styles.item}>
                  <div className={styles.dot}></div>
                  <div className={styles.line}></div>
                  <div className={styles.time}>
                    {new Date(item.publishedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}
                  </div>
                  <div className={styles.details}>
                    <span className={`${styles.judgment} ${
                      item.judgment === "최강호재" ? styles.strongBullish :
                      item.judgment === "호재" ? styles.bullish :
                      item.judgment === "악재" ? styles.bearish : styles.neutral
                    }`}>
                      {item.judgment || item.sentiment}
                    </span>
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
