"use client";

import { useEffect, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import styles from "@/components/us-turnover-trend.module.css";

type Candidate = {
  symb: string;
  name: string;
  ename: string;
  rank: number;
  price: number;
  changeRate: number;
  tradeAmount: number;
  prevTradeAmount: number;
  prevVolume: number;
  marketCap: number;
  minuteTradeAmount: number;
  minuteTradeAmount3m: number;
  minuteTradeAmount5m: number;
  minuteVolume3m: number;
  score: number;
  reason: string[];
};

type Response = {
  ok: boolean;
  status: number;
  candidates: Candidate[];
};

function formatMoney(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}억`;
  if (value >= 10000) return `${Math.floor(value / 10000)}만`;
  return value.toLocaleString();
}

export function AmsScoutPage() {
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stock/us/ams-scout", { cache: "no-store" });
      const json = (await res.json()) as Response;
      if (!res.ok) throw new Error((json as any)?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <main className={styles.page}>
      <PageNavigation current="us-ams-scout" />
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>AMS SCOUT</div>
            <h1>AMS 급등주 탐색</h1>
            <p>거래대금순위, 현재가상세, 1분봉 데이터를 조합해 급등 후보를 점수화합니다.</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.button} onClick={() => void load()} disabled={loading}>
              {loading ? "조회 중..." : "다시 조회"}
            </button>
          </div>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {loading && <div className={styles.panel}>AMS 데이터를 불러오는 중...</div>}

        {data && (
          <div className={styles.grid}>
            {data.candidates.map((item) => (
              <section key={item.symb} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.symbol}>{item.name}</div>
                    <div className={styles.meta}>
                      {item.symb} · {item.ename || "N/A"}
                    </div>
                  </div>
                  <div className={styles.metric}>
                    <span>점수</span>
                    <strong>{item.score}</strong>
                  </div>
                </div>

                <div className={styles.panel} style={{ padding: 14 }}>
                  <div className={styles.meta}>현재가 {item.price.toLocaleString()} | 등락률 {item.changeRate.toFixed(2)}%</div>
                  <div className={styles.meta}>
                    당일 거래대금 {formatMoney(item.tradeAmount)} | 시총{" "}
                    {item.marketCap ? formatMoney(item.marketCap) : "조회 실패"}
                  </div>
                  <div className={styles.meta}>최근 1분 {formatMoney(item.minuteTradeAmount)} · 3분 {formatMoney(item.minuteTradeAmount3m)} · 5분 {formatMoney(item.minuteTradeAmount5m)}</div>
                  <div className={styles.meta}>전일 거래량 {item.prevVolume.toLocaleString()} | 전일 거래대금 {formatMoney(item.prevTradeAmount)}</div>
                </div>

                <div className={styles.panel} style={{ padding: 14 }}>
                  {item.reason.map((reason) => (
                    <div key={reason} className={styles.meta}>{reason}</div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
