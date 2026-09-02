"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./chart-modal.module.css";
import type { ChartData, ChartFundamentals, OHLCVCandle } from "@/lib/kis-chart";
import { formatDisplayAmount, formatDisplayDate, formatDisplayDateTime, formatDisplayNumber, formatDisplayVolume } from "@/lib/display-number";

type StockTitanNewsItem = { id: number; title: string; translatedTitle: string | null; summary?: string | null; translatedSummary?: string | null; link: string; publishedAt: string | null; source: string; translationStatus?: string | null };

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

type IndicatorLine = { label: string; color: string; values: Array<number | null> };

function rollingAverage(values: number[], period: number, index: number) {
  if (index < period - 1) return null;
  return values.slice(index - period + 1, index + 1).reduce((sum, value) => sum + value, 0) / period;
}

function emaSeries(values: number[], period: number): Array<number | null> {
  values = values.map(Number);
  if (values.length < period) return values.map(() => null);
  const result: Array<number | null> = values.map(() => null);
  const multiplier = 2 / (period + 1);
  let previous = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  result[period - 1] = previous;
  for (let index = period; index < values.length; index += 1) {
    previous = (values[index] - previous) * multiplier + previous;
    result[index] = previous;
  }
  return result;
}

function indicatorLines(candles: OHLCVCandle[]): IndicatorLine[] {
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);
  const rsi: Array<number | null> = [], mfi: Array<number | null> = [], macd: Array<number | null> = [], macdSignal: Array<number | null> = [];
  const dmiPlus: Array<number | null> = [], dmiMinus: Array<number | null> = [], stochastic: Array<number | null> = [];
  const obv: number[] = [], adl: number[] = [];
  let obvValue = 0, adlValue = 0;
  const ema = (values: number[], period: number) => { const result: number[] = []; const k = 2 / (period + 1); values.forEach((value, i) => { result.push(i === 0 ? value : value * k + result[i - 1] * (1 - k)); }); return result; };
  const ema12 = ema(closes, 12), ema26 = ema(closes, 26), macdRaw = closes.map((_, i) => ema12[i] - ema26[i]), signalRaw = ema(macdRaw, 9);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) obvValue = volumes[i]; else obvValue += closes[i] > closes[i - 1] ? volumes[i] : closes[i] < closes[i - 1] ? -volumes[i] : 0;
    const range = highs[i] - lows[i]; adlValue += range > 0 ? (((closes[i] - lows[i]) - (highs[i] - closes[i])) / range) * volumes[i] : 0;
    obv.push(obvValue); adl.push(adlValue);
    const rsiStart = Math.max(1, i - 13);
    const rsiDiffs = closes.slice(rsiStart, i + 1).map((value, j) => value - closes[rsiStart + j - 1]);
    const gains = rsiDiffs.map((v) => Math.max(v, 0)), losses = rsiDiffs.map((v) => Math.max(-v, 0));
    const avgGain = gains.reduce((a, b) => a + b, 0) / 14, avgLoss = losses.reduce((a, b) => a + b, 0) / 14;
    rsi.push(i < 14 ? null : avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
    const typical = candles.slice(Math.max(0, i - 14), i + 1).map((c) => (c.high + c.low + c.close) / 3);
    let positive = 0, negative = 0;
    for (let j = 1; j < typical.length; j++) { const flow = typical[j] * candles[Math.max(0, i - 14) + j].volume; if (typical[j] > typical[j - 1]) positive += flow; else if (typical[j] < typical[j - 1]) negative += flow; }
    mfi.push(i < 14 ? null : negative === 0 ? 100 : 100 - 100 / (1 + positive / negative));
    macd.push(macdRaw[i]); macdSignal.push(signalRaw[i]);
    const dmiStart = Math.max(1, i - 13); let trSum = 0, plusSum = 0, minusSum = 0;
    for (let j = dmiStart; j <= i; j++) { const tr = Math.max(highs[j] - lows[j], Math.abs(highs[j] - closes[j - 1]), Math.abs(lows[j] - closes[j - 1])); const upMove = highs[j] - highs[j - 1], downMove = lows[j - 1] - lows[j]; trSum += tr; plusSum += upMove > downMove && upMove > 0 ? upMove : 0; minusSum += downMove > upMove && downMove > 0 ? downMove : 0; }
    dmiPlus.push(i < 14 ? null : trSum ? (plusSum / trSum) * 100 : 0); dmiMinus.push(i < 14 ? null : trSum ? (minusSum / trSum) * 100 : 0);
    const low14 = Math.min(...lows.slice(Math.max(0, i - 13), i + 1)), high14 = Math.max(...highs.slice(Math.max(0, i - 13), i + 1));
    stochastic.push(i < 13 || high14 === low14 ? null : ((closes[i] - low14) / (high14 - low14)) * 100);
  }
  return [{ label: "RSI (14)", color: "#f59e0b", values: rsi }, { label: "MFI (14)", color: "#a78bfa", values: mfi }, { label: "MACD", color: "#38bdf8", values: macd }, { label: "MACD Signal", color: "#f97316", values: macdSignal }, { label: "+DI", color: "#22c55e", values: dmiPlus }, { label: "-DI", color: "#ef4444", values: dmiMinus }, { label: "Stochastic", color: "#e879f9", values: stochastic }, { label: "OBV", color: "#14b8a6", values: obv }, { label: "ADL", color: "#60a5fa", values: adl }];
}

function IndicatorCharts({ candles }: { candles: OHLCVCandle[] }) {
  const lines = indicatorLines(candles);
  const groups = [[lines[0], lines[1]], [lines[2], lines[3]], [lines[4], lines[5]], [lines[6]], [lines[7]], [lines[8]]];
  return <div className={styles.indicatorCharts}>{groups.map((group, groupIndex) => { const all = group.flatMap((line) => line.values).filter((v): v is number => v !== null && Number.isFinite(v)); const min = Math.min(...all), max = Math.max(...all), span = max - min || 1; return <div className={styles.indicatorPlot} key={groupIndex}><div className={styles.plotLegend}>{group.map((line) => <span key={line.label} style={{ color: line.color }}>● {line.label}</span>)}</div><svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-label={group.map((line) => line.label).join(", ")}><line x1="0" y1="14" x2="100" y2="14" stroke="rgba(148,163,184,.12)" />{group.map((line) => { const points = line.values.map((value, i) => value === null ? null : `${(i / Math.max(1, line.values.length - 1)) * 100},${28 - ((value - min) / span) * 24 - 2}`).filter(Boolean).join(" "); return <polyline key={line.label} points={points} fill="none" stroke={line.color} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />; })}</svg></div>; })}</div>;
}

function FundamentalsPanel({ data, fundamentals, timeframe, isUsChart }: { data?: ChartData; fundamentals?: ChartFundamentals; timeframe: "D" | "W" | "M"; isUsChart: boolean }) {
  const f = fundamentals ?? data?.fundamentals;
  const timeframeLabel = timeframe === "D" ? "일봉" : timeframe === "W" ? "주봉" : "월봉";
  const candleDate = data?.candles.at(-1)?.date;
  const normalizedCandleDate = candleDate && /^\d{8}$/.test(candleDate) ? `${candleDate.slice(0, 4)}-${candleDate.slice(4, 6)}-${candleDate.slice(6, 8)}` : candleDate;
  const sourceLabel = f?.source === "KIS_DOMESTIC_PRICE" ? "KIS 국내 시세" : f?.source === "KIS_US_PRICE" ? "KIS 해외 시세" : f?.source ?? "미확인";
  const statusLabel = f?.status === "AVAILABLE" ? "정상" : f?.status === "STALE" ? "지연" : "미확인";
  const amount = (number: number | null | undefined) => formatDisplayAmount(number, isUsChart ? "USD" : "KRW");
  const items = [["시가총액", amount(f?.marketCap)], ["최근 거래대금", amount(f?.latestTradingValue)], ["20봉 평균 거래대금", amount(f?.averageTradingValue20)], ["최근 거래량", formatDisplayVolume(f?.latestVolume)], ["20봉 평균 거래량", formatDisplayVolume(f?.averageVolume20)], ["RVOL", f?.rvol == null || !Number.isFinite(f.rvol) ? "미확인" : `${formatDisplayNumber(f.rvol)}배`]];
  return <div><div className={styles.indicators}>{items.map(([label, current]) => <div className={styles.indicatorCard} key={label}><span className={styles.indicatorLabel}>{label}</span><span className={styles.indicatorValue}>{current}</span><span className={styles.indicatorSub}>{timeframeLabel} 완료봉 기준</span></div>)}</div><div className={styles.indicatorSub} style={{ marginTop: 16, lineHeight: 1.7 }}>기본정보 기준시각: {formatDisplayDateTime(f?.observedAt)}<br/>기본정보 갱신시각: {formatDisplayDateTime(f?.fetchedAt)}<br/>봉 데이터 기준일: {formatDisplayDate(normalizedCandleDate)}<br/>봉 데이터 갱신시각: {formatDisplayDateTime(data?.candleDataUpdatedAt)}<br/>출처: {sourceLabel} · 상태: {statusLabel}</div></div>;
}

function NewsPanel({ items, loading, error }: { items: StockTitanNewsItem[]; loading: boolean; error: string | null }) {
  if (loading) return <div className={styles.chartLoading}>RSS·공시 뉴스를 불러오는 중…</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  if (!items.length) return <div className={styles.empty}>저장된 RSS·공시 뉴스가 없습니다.</div>;
  return <div className={styles.newsList}>{items.map((item) => <article className={styles.newsItem} key={item.id}><time>{item.source} · {item.publishedAt ? formatDisplayDateTime(item.publishedAt) : "미확인"}</time><a href={item.link} target="_blank" rel="noreferrer">{item.translatedTitle || item.title}</a>{item.translatedTitle && item.translatedTitle !== item.title && <small>{item.title}</small>}{(item.translatedSummary || item.summary) && <p>{item.translatedSummary || item.summary}</p>}</article>)}</div>;
}

export function ChartModal({ code, company, onClose }: ChartModalProps) {
  const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("D");
  const [activeTab, setActiveTab] = useState<"chart" | "fundamentals" | "news">("chart");
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackFundamentals, setFallbackFundamentals] = useState<ChartFundamentals | undefined>();
  const [news, setNews] = useState<StockTitanNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
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
    setFallbackFundamentals(undefined);
    const market = code.startsWith("US:") ? "US" : "KR";
    fetch(`/api/stock/chart?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}&market=${market}&timeframe=${timeframe}`)
      .then((r) => {
        if (!r.ok) return r.json().then((e) => { if (e.fundamentals) setFallbackFundamentals(e.fundamentals); return Promise.reject(new Error(e.error ?? `HTTP ${r.status}`)); });
        return r.json();
      })
      .then((json: ChartData) => setData(json))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [code, company, timeframe]);

  useEffect(() => {
    if (activeTab !== "news") return;
    let cancelled = false;
    setNewsLoading(true); setNewsError(null);
    fetch(`/api/stock/news?ticker=${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body; }).then((body: { items?: StockTitanNewsItem[] }) => { if (!cancelled) setNews(body.items ?? []); }).catch((error: Error) => { if (!cancelled) setNewsError(error.message); }).finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, code]);

  // TradingView Lightweight Charts 렌더링
  useEffect(() => {
    if (activeTab !== "chart" || !data || !chartRef.current) return;

    // cleanup previous instance
    if (cleanupRef.current) cleanupRef.current();

    let cancelled = false;

    import("lightweight-charts").then(({ createChart, CrosshairMode, CandlestickSeries, LineSeries, LineStyle, HistogramSeries }) => {
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

      // KIS 응답 순서가 시장/주기에 따라 달라질 수 있으므로 차트 입력 직전에
      // 숫자 날짜 기준으로 오름차순 정렬하고, 같은 날짜의 중복 봉을 제거한다.
      // Lightweight Charts는 setData()에 strictly ascending time을 요구한다.
      const candles = Array.from(
        new Map(
          data.candles
            .filter((c) => /^\d{8}$/.test(c.date) && Number.isFinite(c.close))
            .map((c) => [c.date, c] as const),
        ).values(),
      ).sort((a, b) => Number(a.date) - Number(b.date));
      const candleData = candles.map((c) => ({
        time: `${c.date.slice(0, 4)}-${c.date.slice(4, 6)}-${c.date.slice(6, 8)}` as any,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
      }));
      candleSeries.setData(candleData);

      // 일반 이동평균선은 프로젝트 규칙에 따라 EMA를 사용한다.
      const emaColors = new Map([[9, "#facc15"], [20, "#fb923c"], [60, "#c084fc"]]);
      const closeValues = candles.map((item) => item.close);
      for (const [period, color] of emaColors) {
        const values = emaSeries(closeValues, period);
        const series = chart.addSeries(LineSeries, {
          color,
          lineWidth: 2,
          lastValueVisible: false,
          priceLineVisible: false,
        });
        series.setData(candles.map((candle, index) => ({
          time: `${candle.date.slice(0, 4)}-${candle.date.slice(4, 6)}-${candle.date.slice(6, 8)}` as any,
          value: values[index],
        })).filter((point): point is { time: any; value: number } => point.value != null));
      }

      // 거래량 막대와 20개 봉 평균 거래량 선
      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceScaleId: "volume",
        priceFormat: { type: "volume" },
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeSeries.setData(candles.map((candle, index) => ({
        time: `${candle.date.slice(0, 4)}-${candle.date.slice(4, 6)}-${candle.date.slice(6, 8)}` as any,
        value: Number(candle.volume),
        color: index > 0 && candle.close >= candles[index - 1].close ? "rgba(255,77,77,0.55)" : "rgba(77,148,255,0.55)",
      })));
      chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
      const volumeAverageSeries = chart.addSeries(LineSeries, {
        priceScaleId: "volume",
        color: "#facc15",
        lineWidth: 1,
        lastValueVisible: false,
        priceLineVisible: false,
      });
      volumeAverageSeries.setData(candles.map((candle, index) => ({
        time: `${candle.date.slice(0, 4)}-${candle.date.slice(4, 6)}-${candle.date.slice(6, 8)}` as any,
        value: candles.slice(Math.max(0, index - 19), index + 1).reduce((sum, item) => sum + item.volume, 0) / Math.min(20, index + 1),
      })));

      // 볼린저 밴드: 각 일봉 시점의 최근 20개 종가로 전체 구간을 계산한다.
      if (candles.length >= 20) {
        const bands = candles.slice(19).map((candle, index) => {
          const end = index + 20;
          const closes = candles.slice(end - 20, end).map((item) => item.close);
          const middle = closes.reduce((sum, value) => sum + value, 0) / 20;
          const variance = closes.reduce((sum, value) => sum + (value - middle) ** 2, 0) / 20;
          const deviation = Math.sqrt(variance);
          return {
            time: `${candle.date.slice(0, 4)}-${candle.date.slice(4, 6)}-${candle.date.slice(6, 8)}` as any,
            upper: middle + 2 * deviation,
            middle,
            lower: middle - 2 * deviation,
          };
        });
        const bbUpperSeries = chart.addSeries(LineSeries, { color: "rgba(0,255,163,0.45)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const bbMiddleSeries = chart.addSeries(LineSeries, { color: "rgba(0,255,163,0.7)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false, lineStyle: LineStyle.Dotted });
        const bbLowerSeries = chart.addSeries(LineSeries, { color: "rgba(0,255,163,0.4)", lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        bbUpperSeries.setData(bands.map((band) => ({ time: band.time, value: band.upper })));
        bbMiddleSeries.setData(bands.map((band) => ({ time: band.time, value: band.middle })));
        bbLowerSeries.setData(bands.map((band) => ({ time: band.time, value: band.lower })));
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
      if (cleanupRef.current) cleanupRef.current();
    };
  }, [data, activeTab]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) cleanupRef.current();
    };
  }, []);

  const indicators = data?.indicators;
  const isUsChart = code.startsWith("US:");
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
                <span className={styles.price}>{isUsChart ? "$" : ""}{formatDisplayNumber(data.latestPrice)}{isUsChart ? "" : "원"}</span>
                <span className={isUp ? styles.changeUp : styles.changeDown}>
                  {data.latestChange} ({data.latestChangeRate})
                </span>
              </div>
            )}
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="차트 정보"><button id="chart-tab" className={`${styles.tab} ${activeTab === "chart" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "chart"} aria-controls="chart-panel" onClick={() => setActiveTab("chart")}>차트</button><button id="fundamentals-tab" className={`${styles.tab} ${activeTab === "fundamentals" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "fundamentals"} aria-controls="fundamentals-panel" onClick={() => setActiveTab("fundamentals")}>기본 정보</button><button id="news-tab" className={`${styles.tab} ${activeTab === "news" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "news"} aria-controls="news-panel" onClick={() => setActiveTab("news")}>뉴스</button></div>

        {/* 바디 */}
        <div className={styles.body}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }} role="tablist" aria-label="차트 주기">
            {([["D", "일봉"], ["W", "주봉"], ["M", "월봉"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setTimeframe(value)} aria-selected={timeframe === value}
                style={{ padding: "8px 14px", borderRadius: "8px", background: timeframe === value ? "#00ffa3" : "rgba(148,163,184,.16)", color: timeframe === value ? "#020617" : "#cbd5e1", fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>
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

          {error && activeTab === "fundamentals" && <FundamentalsPanel fundamentals={fallbackFundamentals} timeframe={timeframe} isUsChart={isUsChart} />}

          {!loading && !error && data && activeTab === "chart" && (
            <div id="chart-panel" role="tabpanel" aria-labelledby="chart-tab">
              {/* 캔들 차트 */}
              <div className={styles.chartLegend} aria-label="지수이동평균선 범례">
                <span style={{ color: "#facc15" }}>● EMA 9</span>
                <span style={{ color: "#fb923c" }}>● EMA 20</span>
                <span style={{ color: "#c084fc" }}>● EMA 60</span>
              </div>
              <div className={styles.chartWrap} ref={chartRef} />
              <IndicatorCharts candles={data.candles} />

            </div>
          )}
          {!loading && data && activeTab === "fundamentals" && <div id="fundamentals-panel" role="tabpanel" aria-labelledby="fundamentals-tab"><FundamentalsPanel data={data} timeframe={timeframe} isUsChart={isUsChart} /></div>}
          {activeTab === "news" && <div id="news-panel" role="tabpanel" aria-labelledby="news-tab"><NewsPanel items={news} loading={newsLoading} error={newsError} /></div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
