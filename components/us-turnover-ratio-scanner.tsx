"use client";

import { useEffect, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import styles from "@/app/scanners/top-rising/page.module.css";

type Item = { rank: number; code: string; name: string; price: string; changeRate: string; marketCap: number; tradingValue: number; turnoverRatio: number };
const formatValue = (value: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);

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
      <div className={styles.headerArea}><div className={styles.titleGroup}><p className={styles.kicker}>LIVE QUANT TERMINAL</p><h1>시총 대비 거래대금 스캐너</h1><p className={styles.subtitle}>미국 상승률 TOP 100 중 당일 거래대금이 시총의 1~5%인 종목</p></div></div>
      {error && <div className={styles.errorAlert}>ERROR: {error}</div>}
      {loading ? <div className={styles.loaderArea}><p>실시간 데이터를 분석하는 중...</p></div> : items.length === 0 ? <div className={styles.emptyArea}><p>조건에 맞는 종목이 없습니다.</p></div> : <div className={styles.tableWrapper}><table className={styles.table}><thead><tr><th>순위</th><th>종목</th><th>등락률</th><th>현재가</th><th>시가총액</th><th>거래대금</th><th>시총 대비</th></tr></thead><tbody>{items.map((item) => <tr key={item.code}><td>{item.rank}</td><td>{item.name || item.code}<small> {item.code}</small></td><td>{item.changeRate}</td><td>{item.price}</td><td>{formatValue(item.marketCap)}</td><td>{formatValue(item.tradingValue)}</td><td>{item.turnoverRatio.toFixed(2)}%</td></tr>)}</tbody></table></div>}
    </div>
  </main>;
}
