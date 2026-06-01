"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./chart-modal.module.css";
import type { ChartData } from "@/lib/kis-chart";

interface ChartModalProps {
  code: string;
  company: string;
  onClose: () => void;
}

/** RSI 해석 */
function rsiLabel(rsi: number | null): { text: string; cls: string } {
  if (rsi === null) return { text: "N/A", cls: "" };
  if (rsi >= 70) return { text: "과매수 ⚠", cls: styles.rsiOverbought };
  if (rsi <= 30) return { text: "과매도 ✅", cls: styles.rsiOversold };
  return { text: "중립", cls: styles.rsiNeutral };
}

/** BB 해석 */
function bbLabel(close: number, upper: number | null, lower: number | null): { text: string; cls: string } {
  if (!upper || !lower) return { text: "-", cls: styles.bbNormal };
  if (close >= upper) return { text: "상단 돌파 ⚠", cls: styles.bbOverBought };
  if (close <= lower) return { text: "하단 이탈 ✅", cls: styles.bbOverSold };
  return { text: "밴드 내", cls: styles.bbNormal };
}

export function ChartModal({ code, company, onClose }: ChartModalProps) {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // 차트 데이터 로드
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/stock/chart?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(new Error(e.error ?? `HTTP ${r.status}`)));
        return r.json();
      })
      .then((json: ChartData) => setData(json))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code, company]);

  // TradingView Lightweight Charts 렌더링
  useEffect(() => {
    if (!data || !chartRef.current) return;

    // cleanup previous instance
    if (cleanupRef.current) cleanupRef.current();

    let cancelled = false;

    import("lightweight-charts").then(({ createChart, CrosshairMode, CandlestickSeries, LineSeries, LineStyle }) => {
      if (cancelled || !chartRef.current) return;

      const chart = createChart(chartRef.current, {
        width: chartRef.current.clientWidth,
        height: chartRef.current.clientHeight,
        layout: {
          background: { color: "transparent" },
          textColor: "#94a3b8",
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: true,
          secondsVisible: false,
        },
      });

      // 캔들스틱 시리즈
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#ff4d4d",
        downColor: "#4d94ff",
        borderUpColor: "#ff4d4d",
        borderDownColor: "#4d94ff",
        wickUpColor: "#ff4d4d",
        wickDownColor: "#4d94ff",
      });

      const candleData = data.candles.map((c) => ({
        time: `${c.date.slice(0, 4)}-${c.date.slice(4, 6)}-${c.date.slice(6, 8)}` as any,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleSeries.setData(candleData);

      // 볼린저 밴드 (상단/하단 라인)
      const { bbUpper, bbMiddle, bbLower } = data.indicators;
      if (bbUpper && bbMiddle && bbLower && data.candles.length > 0) {
        const lastDate = data.candles[data.candles.length - 1].date;
        const t = `${lastDate.slice(0, 4)}-${lastDate.slice(4, 6)}-${lastDate.slice(6, 8)}` as any;

        const bbUpperSeries = chart.addSeries(LineSeries, { color: "rgba(255,77,77,0.4)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const bbMiddleSeries = chart.addSeries(LineSeries, { color: "rgba(255,255,255,0.25)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, lineStyle: LineStyle.Dotted });
        const bbLowerSeries = chart.addSeries(LineSeries, { color: "rgba(0,255,163,0.4)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });

        bbUpperSeries.setData([{ time: t, value: bbUpper }]);
        bbMiddleSeries.setData([{ time: t, value: bbMiddle }]);
        bbLowerSeries.setData([{ time: t, value: bbLower }]);
      }

      chart.timeScale().fitContent();

      // 반응형 리사이즈
      const ro = new ResizeObserver(() => {
        if (chartRef.current) {
          chart.applyOptions({
            width: chartRef.current.clientWidth,
            height: chartRef.current.clientHeight,
          });
        }
      });
      if (chartRef.current) ro.observe(chartRef.current);

      cleanupRef.current = () => {
        cancelled = true;
        ro.disconnect();
        chart.remove();
        cleanupRef.current = null;
      };
    });

    return () => {
      cancelled = true;
    };
  }, [data]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  const indicators = data?.indicators;
  const rsiInfo = rsiLabel(indicators?.rsi14 ?? null);
  const bbInfo = bbLabel(data?.latestPrice ?? 0, indicators?.bbUpper ?? null, indicators?.bbLower ?? null);
  const isUp = data?.latestChangeRate?.startsWith("+") ?? false;

  return createPortal(
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        {/* 헤더 */}
        <div className={styles.header}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
            <div className={styles.titleBlock}>
              <span className={styles.company}>{company}</span>
              <span className={styles.code}>{code}</span>
            </div>
            {data && (
              <div className={styles.priceBlock}>
                <span className={styles.price}>{data.latestPrice.toLocaleString()}원</span>
                <span className={isUp ? styles.changeUp : styles.changeDown}>
                  {data.latestChange} ({data.latestChangeRate})
                </span>
              </div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {/* 바디 */}
        <div className={styles.body}>
          {loading && (
            <div className={styles.chartWrap}>
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>차트 데이터 로딩 중…</span>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.error}>
              <span className={styles.errorIcon}>📡</span>
              <span>{error}</span>
              <small style={{ color: "#475569" }}>장중에만 실시간 데이터가 제공됩니다</small>
            </div>
          )}

          {!loading && !error && data && (
            <>
              {/* 캔들 차트 */}
              <div className={styles.chartWrap} ref={chartRef} />

              {/* 기술적 지표 카드 */}
              <div className={styles.indicators}>
                {/* RSI */}
                <div className={styles.indicatorCard}>
                  <span className={styles.indicatorLabel}>RSI (14)</span>
                  <span className={`${styles.indicatorValue} ${rsiInfo.cls}`}>
                    {indicators?.rsi14 !== null && indicators?.rsi14 !== undefined
                      ? indicators.rsi14.toFixed(1)
                      : "N/A"}
                  </span>
                  <span className={styles.indicatorSub}>{rsiInfo.text}</span>
                </div>

                {/* MACD */}
                <div className={styles.indicatorCard}>
                  <span className={styles.indicatorLabel}>MACD</span>
                  <span className={`${styles.indicatorValue} ${
                    (indicators?.macd ?? 0) >= 0 ? styles.macdPositive : styles.macdNegative
                  }`}>
                    {indicators?.macd !== null && indicators?.macd !== undefined
                      ? indicators.macd.toLocaleString()
                      : "N/A"}
                  </span>
                  <span className={styles.indicatorSub}>
                    시그널: {indicators?.macdSignal?.toLocaleString() ?? "N/A"} &nbsp;|&nbsp;
                    히스토: <span className={(indicators?.macdHist ?? 0) >= 0 ? styles.macdPositive : styles.macdNegative}>
                      {indicators?.macdHist?.toLocaleString() ?? "N/A"}
                    </span>
                  </span>
                </div>

                {/* 볼린저 밴드 */}
                <div className={styles.indicatorCard}>
                  <span className={styles.indicatorLabel}>볼린저 밴드</span>
                  <span className={styles.indicatorValue} style={{ fontSize: "14px" }}>
                    {indicators?.bbUpper?.toLocaleString() ?? "N/A"}
                  </span>
                  <span className={styles.indicatorSub}>
                    중: {indicators?.bbMiddle?.toLocaleString() ?? "-"} &nbsp;|&nbsp;
                    하: {indicators?.bbLower?.toLocaleString() ?? "-"}
                    <br />
                    <span className={bbInfo.cls}>{bbInfo.text}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
