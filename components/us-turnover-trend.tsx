"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PageNavigation } from "@/components/page-navigation";
import styles from "./us-turnover-trend.module.css";

type TrendPoint = {
  index: number;
  time: string;
  price: number;
  amount: number;
  raw: Record<string, unknown>;
};

type TrendResponse = {
  ok: boolean;
  status: number;
  points: TrendPoint[];
  response: {
    rawText: string;
    parsed: unknown;
  };
};

function formatAmount(value: number) {
  if (value >= 100000000) return `${(value / 100000000).toFixed(1)}억`;
  if (value >= 10000) return `${(value / 10000).toFixed(1)}만`;
  return value.toLocaleString();
}

function normalizeSymbols(input: string) {
  return Array.from(
    new Set(
      input
        .split(/[\s,]+/)
        .map((v) => v.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export function UsTurnoverTrend() {
  const [input, setInput] = useState("AAPL,TSLA,NVDA");
  const [symbols, setSymbols] = useState<string[]>(["AAPL", "TSLA", "NVDA"]);
  const [market, setMarket] = useState("NAS");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, TrendResponse>>({});
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const cleanupRef = useRef<Record<string, () => void>>({});

  const normalizedSymbols = useMemo(() => normalizeSymbols(input), [input]);

  const loadSymbol = async (symbol: string) => {
    const res = await fetch(`/api/stock/us/turnover-trend?code=${encodeURIComponent(symbol)}&market=${encodeURIComponent(market)}&nmin=1`, {
      cache: "no-store",
    });
    const json = (await res.json()) as TrendResponse;
    if (!res.ok) {
      throw new Error(json?.response?.rawText || `HTTP ${res.status}`);
    }
    return json;
  };

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      setSymbols(normalizedSymbols);
      const nextData: Record<string, TrendResponse> = {};
      const persistedSymbols: string[] = [];
      for (const symbol of normalizedSymbols) {
        const result = await loadSymbol(symbol);
        nextData[symbol] = result;
        if ((result.points?.length ?? 0) > 0) {
          persistedSymbols.push(symbol);
        }
      }
      setData(nextData);
      await fetch("/api/stock/us/turnover-symbols", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbols: persistedSymbols }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stock/us/turnover-symbols", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          const saved = normalizeSymbols(Array.isArray(json.symbols) ? json.symbols : []);
          if (saved.length > 0) {
            setSymbols(saved);
            setInput(saved.join(","));
          }
        }
      } catch {}
      void handleLoad();
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function renderCharts() {
      const { createChart, LineSeries, ColorType } = await import("lightweight-charts");
      for (const symbol of symbols) {
        const ref = chartRefs.current[symbol];
        const points = data[symbol]?.points ?? [];
        if (!ref || points.length === 0 || cancelled) continue;

        cleanupRef.current[symbol]?.();
        ref.innerHTML = "";
        const chart = createChart(ref, {
          width: ref.clientWidth,
          height: ref.clientHeight,
          layout: {
            background: { type: ColorType.Solid, color: "transparent" },
            textColor: "#94a3b8",
          },
          grid: {
            vertLines: { color: "rgba(255,255,255,0.05)" },
            horzLines: { color: "rgba(255,255,255,0.05)" },
          },
          rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
          timeScale: { borderColor: "rgba(255,255,255,0.08)", timeVisible: false, secondsVisible: false },
        });

        const series = chart.addSeries(LineSeries, {
          color: "#00ffa3",
          lineWidth: 2,
          lastValueVisible: true,
          priceLineVisible: true,
        });

        series.setData(
          points.map((point) => ({
            time: point.index as any,
            value: point.amount,
          }))
        );

        chart.timeScale().fitContent();

        const ro = new ResizeObserver(() => {
          chart.applyOptions({ width: ref.clientWidth, height: ref.clientHeight });
        });
        ro.observe(ref);

        cleanupRef.current[symbol] = () => {
          ro.disconnect();
          chart.remove();
        };
      }
    }

    void renderCharts();
    return () => {
      cancelled = true;
      Object.values(cleanupRef.current).forEach((fn) => fn());
      cleanupRef.current = {};
    };
  }, [data, symbols]);

  return (
    <div className={styles.page}>
      <PageNavigation current="us-turnover-trend" />
      <div className={styles.shell}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>US TURNOVER TREND</div>
            <h1>해외주식 거래대금 추이</h1>
            <p>종목코드를 복수로 입력하면 각 종목의 금일 분봉 거래대금 추이를 동시에 볼 수 있습니다.</p>
          </div>
          <div className={styles.actions}>
            <select className={styles.select} value={market} onChange={(e) => setMarket(e.target.value)}>
              <option value="NAS">NASDAQ</option>
              <option value="NYS">NYSE</option>
              <option value="AMS">AMEX</option>
            </select>
            <button className={styles.button} onClick={handleLoad} disabled={loading}>
              {loading ? "조회 중..." : "조회"}
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <label className={styles.label} htmlFor="symbols">
            종목코드
          </label>
          <textarea
            id="symbols"
            className={styles.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="AAPL, TSLA, NVDA"
          />
          <div className={styles.helper}>콤마 또는 공백으로 여러 종목을 입력하세요.</div>
        </div>

        {error && <div className={styles.error}>{error}</div>}

        <div className={styles.grid}>
          {symbols.map((symbol) => {
            const item = data[symbol];
            const points = item?.points ?? [];
            const latest = points[points.length - 1];
            return (
              <section key={symbol} className={styles.card}>
                <div className={styles.cardHeader}>
                  <div>
                    <div className={styles.symbol}>{symbol}</div>
                    <div className={styles.meta}>{points.length} points</div>
                  </div>
                  <div className={styles.metric}>
                    <span>금일 거래대금</span>
                    <strong>{latest ? formatAmount(latest.amount) : "-"}</strong>
                  </div>
                </div>
                <div
                  ref={(el) => {
                    chartRefs.current[symbol] = el;
                  }}
                  className={styles.chart}
                />
                <div className={styles.raw}>
                  {latest ? `현재가 ${latest.price.toLocaleString()} | 마지막 시점 ${latest.time || "N/A"}` : "데이터 없음"}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
