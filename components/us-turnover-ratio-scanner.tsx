"use client";

import { useEffect, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import { formatKoreanAmount } from "@/lib/korean-number-format";
import styles from "@/app/scanners/top-rising/page.module.css";

type Item = { market: string; rank: number; code: string; name: string; price: string; changeRate: string; marketCap: number; tradingValue: number; turnoverRatio: number; trend?: { oneMinuteIncrease: number | null } };

export function UsTurnoverRatioScanner() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const response = await fetch("/api/stock/us/turnover-ratio", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "데이터를 가져오지 못했습니다.");
      setItems(Array.isArray(data) ? data : []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); const timer = setInterval(() => void load(), GLOBAL_POLLING_INTERVAL); return () => clearInterval(timer); }, []);

  return <main className={styles.page}>
    <PageNavigation current="us-turnover-trend" />
    <div className={styles.container}>
      <div className={styles.headerArea}><div className={styles.titleGroup}><p className={styles.kicker}>LIVE QUANT TERMINAL</p><h1>시총 대비 거래대금 스캐너</h1><p className={styles.subtitle}>AMS·NAS 상승률 TOP 100 중 조건 충족 종목</p></div></div>
      {error && <div className={styles.errorAlert}>ERROR: {error}</div>}
      {loading ? <div className={styles.loaderArea}><p>실시간 데이터를 분석하는 중...</p></div> : items.length === 0 ? <div className={styles.emptyArea}><p>조건에 맞는 종목이 없습니다.</p></div> : <div className={styles.tableWrapper}><table className={styles.table}><thead><tr><th>시장</th><th>순위</th><th>종목</th><th>등락률</th><th>현재가</th><th>시가총액</th><th>거래대금</th><th>시총 대비</th><th>1분 변화</th></tr></thead><tbody>{items.map((item) => { const oneMinuteUp = item.trend?.oneMinuteIncrease != null && item.trend.oneMinuteIncrease > 0; return <tr key={`${item.market}-${item.code}`} className={oneMinuteUp ? styles.oneMinuteUp : undefined}><td>{item.market}</td><td>{item.rank}</td><td>{item.name || item.code}<small> {item.code}</small></td><td>{item.changeRate}</td><td>{item.price}</td><td>{formatKoreanAmount(item.marketCap)}</td><td>{formatKoreanAmount(item.tradingValue)}</td><td>{item.turnoverRatio.toFixed(2)}%</td><td className={oneMinuteUp ? styles.oneMinuteValue : undefined}>{item.trend?.oneMinuteIncrease == null ? "수집 중" : `${item.trend.oneMinuteIncrease >= 0 ? "+" : ""}${item.trend.oneMinuteIncrease.toFixed(2)}%p`}</td></tr>; })}</tbody></table></div>}
    </div>
  </main>;
}
