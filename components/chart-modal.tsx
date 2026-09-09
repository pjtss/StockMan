"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./chart-modal.module.css";
import type { ChartData, ChartFundamentals, OHLCVCandle } from "@/lib/kis-chart";
import { formatDisplayAmount, formatDisplayDate, formatDisplayDateTime, formatDisplayNumber, formatDisplayVolume } from "@/lib/display-number";

type StockTitanNewsItem = { id: number; title: string; translatedTitle: string | null; summary?: string | null; translatedSummary?: string | null; link: string; publishedAt: string | null; source: string; translationStatus?: string | null };
type FlowResponse = { ok: boolean; source?: string; mode?: string; flowStatus?: string; collectedAt?: string; rows?: Array<Record<string, unknown>>; note?: string; instrumentDetail?: Record<string, unknown> };
type RatioResponse = { ok: boolean; rows?: Array<Record<string, unknown>>; collectedAt?: string };
type RatioType = "financial" | "growth" | "profit" | "stability" | "balance-sheet" | "income-statement" | "other-major";
type OpinionResponse = { ok: boolean; rows?: Array<Record<string, unknown>>; collectedAt?: string };
type FlowMode = "investor" | "estimate" | "investor-daily" | "foreign-member" | "foreign-member-tick" | "program" | "program-daily" | "member" | "member-daily" | "conclusion" | "ccnl" | "price2" | "asking" | "price-detail" | "minute" | "minute-5" | "daily-minute" | "daily" | "info" | "product-info" | "stock-info" | "lendable" | "etf-price" | "etf-components" | "etf-nav" | "etf-nav-daily" | "daily-price" | "opinion-by-broker" | "exp-price-trend" | "overtime-conclusion" | "overtime-daily" | "overtime-price" | "overtime-asking" | "short-sale" | "credit" | "loan" | "trade-volume" | "vi" | "pbar" | "trade-participation" | "highlow" | "lowhigh";

interface ChartModalProps {
  code: string;
  company: string;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  position?: { current: number; total: number };
  prefetchCodes?: Array<{ code: string; company: string }>;
}

const chartDataCache = new Map<string, ChartData>();
const chartCacheKey = (code: string, timeframe: string) => `${code}:${timeframe}`;
async function fetchChartData(code: string, company: string, timeframe: "D" | "W" | "M", signal?: AbortSignal) {
  const key = chartCacheKey(code, timeframe);
  const cached = chartDataCache.get(key);
  if (cached) return cached;
  const market = code.startsWith("US:") ? "US" : "KR";
  const response = await fetch(`/api/stock/chart?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}&market=${market}&timeframe=${timeframe}`, { signal });
  const body = await response.json();
  if (!response.ok) {
    const error = new Error(body.error ?? `HTTP ${response.status}`) as Error & { fundamentals?: ChartFundamentals };
    error.fundamentals = body.fundamentals;
    throw error;
  }
  chartDataCache.set(key, body as ChartData);
  return body as ChartData;
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

function KISFlowPanel({ data, loading, error, isUs, mode, onModeChange, realtimeStatus }: { data: FlowResponse | null; loading: boolean; error: string | null; isUs: boolean; mode: FlowMode; onModeChange: (mode: FlowMode) => void; realtimeStatus: "connecting" | "connected" | "unavailable" | "closed" }) {
  if (isUs) return <div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}><button type="button" onClick={() => onModeChange("asking")} aria-pressed={mode === "asking"} style={{ padding: "7px 10px", borderRadius: 8, background: mode === "asking" ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === "asking" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>KIS 해외 1호가</button><button type="button" onClick={() => onModeChange("price-detail")} aria-pressed={mode === "price-detail"} style={{ padding: "7px 10px", borderRadius: 8, background: mode === "price-detail" ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === "price-detail" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>해외 상세시세</button><button type="button" onClick={() => onModeChange("minute")} aria-pressed={mode === "minute"} style={{ padding: "7px 10px", borderRadius: 8, background: mode === "minute" ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === "minute" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>해외 1분봉</button><button type="button" onClick={() => onModeChange("minute-5")} aria-pressed={mode === "minute-5"} style={{ padding: "7px 10px", borderRadius: 8, background: mode === "minute-5" ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === "minute-5" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>해외 5분봉</button><button type="button" onClick={() => onModeChange("daily")} aria-pressed={mode === "daily"} style={{ padding: "7px 10px", borderRadius: 8, background: mode === "daily" ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === "daily" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>해외 기간봉</button></div>{data?.rows?.length ? data.rows.map((row, index) => <div className={styles.indicators} key={index}>{Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== "").slice(0, 24).map(([key, value]) => <div className={styles.indicatorCard} key={key}><span className={styles.indicatorLabel}>{({ pbid1: "매수 1호가", pask1: "매도 1호가", vbid1: "매수 잔량", vask1: "매도 잔량", ovrs: "해외시장", last: "현재가", open: "시가", high: "고가", low: "저가", tvol: "누적 거래량", t_xprc: "거래대금" } as Record<string, string>)[key] ?? key}</span><span className={styles.indicatorValue}>{String(value)}</span></div>)}</div>) : <div className={styles.empty}>{data?.note ?? "KIS 해외 시세 데이터가 없습니다."}</div>}</div>;
  if (loading) return <div className={styles.chartLoading}>KIS 수급 데이터를 불러오는 중…</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  const row = data?.rows?.[0];
  if (!row) return <div className={styles.empty}>KIS 수급 데이터가 없습니다.</div>;
  const labels: Record<string, string> = { frgn_ntby_qty: "외국인 순매수 수량", frgn_ntby_tr_pbmn: "외국인 순매수 금액", orgn_ntby_qty: "기관 순매수 수량", orgn_ntby_tr_pbmn: "기관 순매수 금액", prgrss_netprc: "프로그램 순매수", total_seln_qty: "총 매도 수량", total_shnu_qty: "총 매수 수량", ntby_qty: "순매수 수량", stck_bsop_date: "기준일", prpr_name: "체결금액 구간", smtn_avrg_prpr: "합산 평균 체결가", acml_vol: "누적 거래량", whol_ntby_qty_rate: "전체 순매수 비율", ntby_cntg_csnu: "순매수 체결건수", seln_cnqn_smtn: "총 매도 체결량", whol_seln_vol_rate: "전체 매도 비율", seln_cntg_csnu: "매도 체결건수", shnu_cnqn_smtn: "총 매수 체결량", whol_shun_vol_rate: "전체 매수 비율", shnu_cntg_csnu: "매수 체결건수" };
  return <div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>{([ ["investor", "투자자 확정"], ["estimate", "외인·기관 추정"], ["investor-daily", "투자자 일별"], ["foreign-member", "외인 회원사"], ["foreign-member-tick", "외국계 틱 동향"], ["program", "프로그램"], ["program-daily", "프로그램 일별"], ["member", "회원사"], ["member-daily", "회원사 일별"], ["conclusion", "시간대별 체결"], ["ccnl", "현재 체결"], ["price-detail", "상세 시세"], ["price2", "현재가 시세2"], ["asking", "호가·예상체결"], ["pbar", "매물대·거래비중"], ["trade-participation", "체결금액별 비중"], ["minute", "당일分봉"], ["daily-minute", "과거일 분봉"], ["lendable", "대주 가능"], ["etf-components", "ETF 구성"], ["etf-nav", "ETF NAV"], ["etf-nav-daily", "ETF NAV 일별"], ["daily-price", "최근 30건 일자별 시세"], ["opinion-by-broker", "증권사별 투자의견"], ["exp-price-trend", "예상체결가 추이"], ["overtime-conclusion", "시간외 시간대별 체결"], ["overtime-daily", "시간외 일별"], ["overtime-price", "시간외 현재가"], ["overtime-asking", "시간외 호가"], ["trade-volume", "거래량"], ["vi", "VI 상태"], ["short-sale", "공매도"], ["credit", "신용잔고"], ["loan", "대차거래"], ["highlow", "신고가 근접"], ["lowhigh", "신저가 근접"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => onModeChange(value)} aria-pressed={mode === value} style={{ padding: "7px 10px", borderRadius: 8, background: mode === value ? "#00ffa3" : "rgba(148,163,184,.12)", color: mode === value ? "#020617" : "#cbd5e1", fontWeight: 700 }}>{label}</button>)}</div><div className={styles.indicatorSub}>출처: KIS · 상태: {data?.flowStatus ?? "확인"} · 실시간: {realtimeStatus === "connected" ? "연결됨" : realtimeStatus === "connecting" ? "연결 중" : realtimeStatus === "unavailable" ? "사용 불가" : "종료"} · 수집: {formatDisplayDateTime(data?.collectedAt)}</div><div className={styles.indicators}>{Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== "").slice(0, 24).map(([key, value]) => <div className={styles.indicatorCard} key={key}><span className={styles.indicatorLabel}>{labels[key] ?? key}</span><span className={styles.indicatorValue}>{String(value)}</span></div>)}</div></div>;
}

function RealtimePanel({ row }: { row: Record<string, unknown> | null }) {
  if (!row) return null;
  return <div className={styles.indicators}>{Object.entries(row).slice(0, 12).map(([key, value]) => <div className={styles.indicatorCard} key={key}><span className={styles.indicatorLabel}>실시간 {key}</span><span className={styles.indicatorValue}>{String(value)}</span></div>)}</div>;
}

function KISRatioPanel({ data, loading, error, isUs, type, onTypeChange }: { data: RatioResponse | null; loading: boolean; error: string | null; isUs: boolean; type: RatioType; onTypeChange: (type: RatioType) => void }) {
  if (isUs) return <div className={styles.empty}>KIS 해외주식에는 국내식 재무비율 API가 제공되지 않습니다.</div>;
  if (loading) return <div className={styles.chartLoading}>재무비율을 불러오는 중…</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  const row = data?.rows?.[0];
  return <div><div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>{([ ["financial", "재무비율"], ["growth", "성장성"], ["profit", "수익성"], ["stability", "안정성"], ["balance-sheet", "대차대조표"], ["income-statement", "손익계산서"], ["other-major", "기타 주요비율"] ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => onTypeChange(value)} aria-pressed={type === value} style={{ padding: "7px 10px", borderRadius: 8, background: type === value ? "#00ffa3" : "rgba(148,163,184,.12)", color: type === value ? "#020617" : "#cbd5e1", fontWeight: 700 }}>{label}</button>)}</div>{row ? <><div className={styles.indicators}>{Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== "").slice(0, 24).map(([key, value]) => <div className={styles.indicatorCard} key={key}><span className={styles.indicatorLabel}>{key}</span><span className={styles.indicatorValue}>{String(value)}</span></div>)}</div><div className={styles.indicatorSub}>출처: KIS · 수집: {formatDisplayDateTime(data?.collectedAt)}</div></> : <div className={styles.empty}>KIS 재무 데이터가 없습니다.</div>}</div>;
}

function KISOpinionPanel({ data, loading, error, isUs }: { data: OpinionResponse | null; loading: boolean; error: string | null; isUs: boolean }) {
  if (isUs) return null;
  if (loading) return <div className={styles.chartLoading}>투자의견을 불러오는 중…</div>;
  if (error) return <div className={styles.error}>{error}</div>;
  const row = data?.rows?.[0];
  return row ? <div><div className={styles.indicators}>{Object.entries(row).filter(([, value]) => value !== undefined && value !== null && value !== "").slice(0, 18).map(([key, value]) => <div className={styles.indicatorCard} key={key}><span className={styles.indicatorLabel}>{key}</span><span className={styles.indicatorValue}>{String(value)}</span></div>)}</div><div className={styles.indicatorSub}>KIS 종목 투자의견·목표가 보조신호 · 수집: {formatDisplayDateTime(data?.collectedAt)}</div></div> : <div className={styles.empty}>KIS 투자의견 데이터가 없습니다.</div>;
}

export function ChartModal({ code, company, onClose, onPrevious, onNext, position, prefetchCodes = [] }: ChartModalProps) {
  const isUsChart = code.startsWith("US:");
  const [timeframe, setTimeframe] = useState<"D" | "W" | "M">("D");
  const [activeTab, setActiveTab] = useState<"chart" | "fundamentals" | "flow" | "ratio" | "news">("chart");
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fallbackFundamentals, setFallbackFundamentals] = useState<ChartFundamentals | undefined>();
  const [news, setNews] = useState<StockTitanNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [flow, setFlow] = useState<FlowResponse | null>(null);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "unavailable" | "closed">("closed");
  const [realtimeRow, setRealtimeRow] = useState<Record<string, unknown> | null>(null);
  const [flowMode, setFlowMode] = useState<FlowMode>("investor");
  const [ratio, setRatio] = useState<RatioResponse | null>(null);
  const [ratioLoading, setRatioLoading] = useState(false);
  const [ratioError, setRatioError] = useState<string | null>(null);
  const [ratioType, setRatioType] = useState<RatioType>("financial");
  const [opinion, setOpinion] = useState<OpinionResponse | null>(null);
  const [opinionLoading, setOpinionLoading] = useState(false);
  const [opinionError, setOpinionError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [isWatchlisted, setIsWatchlisted] = useState(false);
  const [watchlistBusy, setWatchlistBusy] = useState(false);
  const [watchlistMessage, setWatchlistMessage] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const chartNodeRef = useRef<HTMLDivElement | null>(null);
  const [chartContainerVersion, setChartContainerVersion] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const requestIdRef = useRef(0);

  const watchlistMarket = code.startsWith("US:") ? "US" : "KR";
  const watchlistCode = code.replace(/^US:/i, "").trim().toUpperCase();

  // 로그인 사용자만 현재 종목의 개인 관심종목 상태를 조회한다.
  useEffect(() => {
    let cancelled = false;
    setIsAuthenticated(null);
    setIsWatchlisted(false);
    setWatchlistMessage(null);
    fetch(`/api/auth/me?ts=${Date.now()}`, { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(async (body: { authenticated?: boolean } | null) => {
        if (cancelled) return;
        const authenticated = Boolean(body?.authenticated);
        setIsAuthenticated(authenticated);
        if (!authenticated) return;
        const response = await fetch(`/api/watchlist?ts=${Date.now()}`, { credentials: "same-origin", cache: "no-store" });
        if (!response.ok) return;
        const watchlist = await response.json() as { items?: Array<{ market: string; code: string }> };
        if (!cancelled) setIsWatchlisted((watchlist.items ?? []).some((item) => item.market === watchlistMarket && item.code.toUpperCase() === watchlistCode));
      })
      .catch(() => { if (!cancelled) setIsAuthenticated(false); });
    return () => { cancelled = true; };
  }, [watchlistCode, watchlistMarket]);

  async function toggleWatchlist() {
    if (isAuthenticated !== true || watchlistBusy) return;
    const nextWatchlisted = !isWatchlisted;
    setWatchlistBusy(true);
    setWatchlistMessage(null);
    try {
      const response = await fetch("/api/watchlist", {
        method: nextWatchlisted ? "POST" : "DELETE",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ market: watchlistMarket, code: watchlistCode }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error === "UNAUTHORIZED" ? "로그인이 필요합니다." : "관심종목 변경에 실패했습니다.");
      setIsWatchlisted(nextWatchlisted);
      setWatchlistMessage(nextWatchlisted ? "관심종목에 추가했습니다." : "관심종목에서 삭제했습니다.");
    } catch (error) {
      setWatchlistMessage(error instanceof Error ? error.message : "관심종목 변경에 실패했습니다.");
    } finally {
      setWatchlistBusy(false);
    }
  }

  // 키보드 단축키: 입력 컨트롤에서는 브라우저의 기본 방향키 동작을 보존한다.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select" || target?.isContentEditable) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft" && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === "ArrowRight" && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrevious, onNext]);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  // 차트 데이터 로드
  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    setData(null);
    setFallbackFundamentals(undefined);
    const controller = new AbortController();
    fetchChartData(code, company, timeframe, controller.signal)
      .then((json) => { if (!controller.signal.aborted && requestIdRef.current === requestId) setData(json); })
      .catch((e: Error & { fundamentals?: ChartFundamentals }) => { if (!controller.signal.aborted && requestIdRef.current === requestId) { setFallbackFundamentals(e.fundamentals); setError(e.message); } })
      .finally(() => { if (!controller.signal.aborted && requestIdRef.current === requestId) setLoading(false); });
    return () => {
      controller.abort();
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [code, company, timeframe]);

  useEffect(() => {
    const targets = prefetchCodes.filter((item) => item.code !== code).slice(0, 2);
    void Promise.allSettled(targets.map((item) => fetchChartData(item.code, item.company, "D")));
  }, [code, prefetchCodes]);

  useEffect(() => {
    if (activeTab !== "news") return;
    let cancelled = false;
    setNewsLoading(true); setNewsError(null);
    fetch(`/api/stock/news?ticker=${encodeURIComponent(code)}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body; }).then((body: { items?: StockTitanNewsItem[] }) => { if (!cancelled) setNews(body.items ?? []); }).catch((error: Error) => { if (!cancelled) setNewsError(error.message); }).finally(() => { if (!cancelled) setNewsLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, code]);

  useEffect(() => {
    if (activeTab !== "flow") return;
    let cancelled = false;
    setFlowLoading(true); setFlowError(null);
    const queryMode = isUsChart ? (flowMode === "asking" ? "asking" : flowMode === "price-detail" ? "price-detail" : flowMode === "minute" || flowMode === "minute-5" ? "minute" : flowMode === "daily" ? "daily" : flowMode === "info" ? "info" : "trade") : flowMode;
    const minute = flowMode === "minute-5" ? "5" : "1";
    const flowRequest = fetch(`/api/kis/market-flow?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}&market=${isUsChart ? "US" : "KR"}&mode=${queryMode}${queryMode === "minute" ? `&minute=${minute}&count=120` : ""}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body as FlowResponse; });
    const detailRequest = isUsChart ? Promise.resolve(null) : fetch(`/api/kis/market-flow?code=${encodeURIComponent(code)}&company=${encodeURIComponent(company)}&market=KR&mode=price-detail`, { cache: "no-store" }).then(async (response) => response.ok ? await response.json() as FlowResponse : null);
    Promise.all([flowRequest, detailRequest]).then(([body, detail]) => { if (!cancelled) { const detailRow = detail?.rows?.[0]; const flowRows = body.rows ?? []; const labeledDetail = detailRow ? { "발행·상장주수 (유통주식수 아님)": detailRow.sharesOutstanding, ...detailRow } : null; const rows = labeledDetail ? (flowRows.length ? [labeledDetail ? { ...labeledDetail, ...flowRows[0] } : flowRows[0], ...flowRows.slice(1)] : [labeledDetail]) : flowRows; setFlow({ ...body, rows, instrumentDetail: detailRow }); } }).catch((e: Error) => { if (!cancelled) setFlowError(e.message); }).finally(() => { if (!cancelled) setFlowLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, code, isUsChart, flowMode]);

  useEffect(() => {
    if (activeTab !== "flow" || typeof WebSocket === "undefined") {
      setRealtimeStatus("closed");
      return;
    }
    let cancelled = false;
    let socket: WebSocket | null = null;
    let lastPersistAt = 0;
    setRealtimeStatus("connecting");
    setRealtimeRow(null);
    const market = isUsChart ? "US" : "KR";
    const channel = flowMode === "asking" ? "asking" : "trade";
    fetch(`/api/kis/realtime/approval?market=${market}&channel=${channel}&code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!response.ok || !body.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body as { wsUrl: string; frame: string }; })
      .then((body) => {
        if (cancelled) return;
        socket = new WebSocket(body.wsUrl);
        socket.onopen = () => { if (!cancelled) { socket?.send(body.frame); setRealtimeStatus("connected"); } };
        socket.onmessage = (event) => {
          if (cancelled || typeof event.data !== "string") return;
          const persist = (trId: string, payload: unknown) => {
            const now = Date.now();
            if (now - lastPersistAt < 1000) return;
            lastPersistAt = now;
            void fetch("/api/kis/realtime/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ market, code, channel, trId, payload, rawPayload: event.data }), keepalive: true }).catch(() => undefined);
          };
          try {
            const parsed = JSON.parse(event.data) as { body?: { output?: Record<string, unknown> } };
            if (parsed.body?.output) { const trId = String((parsed.body.output as Record<string, unknown>).tr_id ?? "realtime"); setRealtimeRow(parsed.body.output); persist(trId, parsed.body.output); }
            return;
          } catch { /* KIS data frames are pipe-delimited */ }
          const [, trId, , rawValues] = event.data.split("|");
          if (!rawValues) return;
          const values = rawValues.split("^");
          const normalizedPayload = { tr_id: trId, values: values.slice(0, 12).join(" | ") };
          setRealtimeRow(normalizedPayload);
          persist(trId, normalizedPayload);
        };
        socket.onerror = () => { if (!cancelled) setRealtimeStatus("unavailable"); };
        socket.onclose = () => { if (!cancelled) setRealtimeStatus("closed"); };
      })
      .catch(() => { if (!cancelled) setRealtimeStatus("unavailable"); });
    return () => { cancelled = true; socket?.close(); };
  }, [activeTab, code, flowMode, isUsChart]);

  useEffect(() => {
    if (activeTab !== "ratio" || isUsChart) return;
    let cancelled = false;
    setRatioLoading(true); setRatioError(null);
    fetch(`/api/kis/financial-ratios?code=${encodeURIComponent(code)}&type=${ratioType}&period=annual`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body; }).then((body: RatioResponse) => { if (!cancelled) setRatio(body); }).catch((e: Error) => { if (!cancelled) setRatioError(e.message); }).finally(() => { if (!cancelled) setRatioLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, code, isUsChart, ratioType]);

  useEffect(() => {
    if (activeTab !== "ratio" || isUsChart) return;
    let cancelled = false;
    setOpinionLoading(true); setOpinionError(null);
    if (!isUsChart) fetch(`/api/kis/investment-opinion?code=${encodeURIComponent(code)}&startDate=${new Date().getFullYear() - 1}0101&endDate=${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`, { cache: "no-store" }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`); return body; }).then((body: OpinionResponse) => { if (!cancelled) setOpinion(body); }).catch((e: Error) => { if (!cancelled) setOpinionError(e.message); }).finally(() => { if (!cancelled) setOpinionLoading(false); });
    return () => { cancelled = true; };
  }, [activeTab, code, isUsChart]);

  // TradingView Lightweight Charts 렌더링: 종목 전환 직후 새 DOM ref가 확정된 뒤 초기화한다.
  useLayoutEffect(() => {
    if (activeTab !== "chart" || !data || !chartRef.current) return;

    // cleanup previous instance
    if (cleanupRef.current) cleanupRef.current();

    let cancelled = false;
    const container = chartRef.current;

    import("lightweight-charts").then(({ createChart, CrosshairMode, CandlestickSeries, LineSeries, LineStyle, HistogramSeries }) => {
      if (cancelled || !container || !container.isConnected) return;

      const chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
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
      ro.observe(container);

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
  }, [data, activeTab, code, timeframe, chartContainerVersion]);

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
      <div ref={modalRef} className={styles.modal} role="dialog" aria-modal="true" tabIndex={-1}>
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
            {isAuthenticated === true && (
              <div className={styles.watchlistAction}>
                <button type="button" className={`${styles.watchlistBtn} ${isWatchlisted ? styles.watchlistBtnActive : ""}`} onClick={toggleWatchlist} disabled={watchlistBusy} aria-pressed={isWatchlisted}>
                  {watchlistBusy ? "처리 중…" : isWatchlisted ? "★ 관심종목 삭제" : "☆ 관심종목 추가"}
                </button>
                {watchlistMessage && <span className={styles.watchlistMessage} role="status">{watchlistMessage}</span>}
              </div>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {position && <span className={styles.code}>{position.current} / {position.total}</span>}
            <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="이전 종목" style={{ padding: "8px 11px", borderRadius: "8px" }}>←</button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="다음 종목" style={{ padding: "8px 11px", borderRadius: "8px" }}>→</button>
            <button className={styles.closeBtn} onClick={onClose} aria-label="닫기">✕</button>
          </div>
        </div>

          <div className={styles.tabs} role="tablist" aria-label="차트 정보"><button id="chart-tab" className={`${styles.tab} ${activeTab === "chart" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "chart"} aria-controls="chart-panel" onClick={() => setActiveTab("chart")}>차트</button><button id="fundamentals-tab" className={`${styles.tab} ${activeTab === "fundamentals" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "fundamentals"} aria-controls="fundamentals-panel" onClick={() => setActiveTab("fundamentals")}>기본 정보</button><button id="flow-tab" className={`${styles.tab} ${activeTab === "flow" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "flow"} aria-controls="flow-panel" onClick={() => setActiveTab("flow")}>수급</button><button id="ratio-tab" className={`${styles.tab} ${activeTab === "ratio" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "ratio"} aria-controls="ratio-panel" onClick={() => setActiveTab("ratio")}>재무</button><button id="news-tab" className={`${styles.tab} ${activeTab === "news" ? styles.tabActive : ""}`} type="button" role="tab" aria-selected={activeTab === "news"} aria-controls="news-panel" onClick={() => setActiveTab("news")}>뉴스</button></div>
          <p className={styles.keyboardHint} aria-label="키보드 단축키">← → 종목 이동 · ESC 닫기</p>

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
            <div key={`${code}:${timeframe}`} id="chart-panel" role="tabpanel" aria-labelledby="chart-tab">
              {/* 캔들 차트 */}
              <div className={styles.chartLegend} aria-label="지수이동평균선 범례">
                <span style={{ color: "#facc15" }}>● EMA 9</span>
                <span style={{ color: "#fb923c" }}>● EMA 20</span>
                <span style={{ color: "#c084fc" }}>● EMA 60</span>
              </div>
              <div className={styles.chartWrap} ref={(node) => {
                chartRef.current = node;
                if (node && node !== chartNodeRef.current) {
                  chartNodeRef.current = node;
                  setChartContainerVersion((version) => version + 1);
                }
              }} />
              <IndicatorCharts candles={data.candles} />

            </div>
          )}
          {!loading && data && activeTab === "fundamentals" && <div id="fundamentals-panel" role="tabpanel" aria-labelledby="fundamentals-tab"><FundamentalsPanel data={data} timeframe={timeframe} isUsChart={isUsChart} /></div>}
          {activeTab === "flow" && <div id="flow-panel" role="tabpanel" aria-labelledby="flow-tab"><KISFlowPanel data={flow} loading={flowLoading} error={flowError} isUs={isUsChart} mode={flowMode} onModeChange={setFlowMode} realtimeStatus={realtimeStatus} />{isUsChart && <button type="button" onClick={() => setFlowMode("info")} aria-pressed={flowMode === "info"} style={{ padding: "7px 10px", borderRadius: 8, background: flowMode === "info" ? "#00ffa3" : "rgba(148,163,184,.12)", color: flowMode === "info" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>해외 기본정보</button>}{!isUsChart && <><button type="button" onClick={() => setFlowMode("product-info")} aria-pressed={flowMode === "product-info"} style={{ padding: "7px 10px", borderRadius: 8, background: flowMode === "product-info" ? "#00ffa3" : "rgba(148,163,184,.12)", color: flowMode === "product-info" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>국내 상품정보</button><button type="button" onClick={() => setFlowMode("stock-info")} aria-pressed={flowMode === "stock-info"} style={{ padding: "7px 10px", borderRadius: 8, background: flowMode === "stock-info" ? "#00ffa3" : "rgba(148,163,184,.12)", color: flowMode === "stock-info" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>국내 주식기본정보</button><button type="button" onClick={() => setFlowMode("etf-price")} aria-pressed={flowMode === "etf-price"} style={{ padding: "7px 10px", borderRadius: 8, background: flowMode === "etf-price" ? "#00ffa3" : "rgba(148,163,184,.12)", color: flowMode === "etf-price" ? "#020617" : "#cbd5e1", fontWeight: 700 }}>ETF 전용 현재가</button></>}<RealtimePanel row={realtimeRow} /></div>}
          {activeTab === "ratio" && <div id="ratio-panel" role="tabpanel" aria-labelledby="ratio-tab"><KISRatioPanel data={ratio} loading={ratioLoading} error={ratioError} isUs={isUsChart} type={ratioType} onTypeChange={setRatioType} /><div style={{ marginTop: 20, borderTop: "1px solid rgba(148,163,184,.16)", paddingTop: 16 }}><div className={styles.indicatorSub} style={{ marginBottom: 10 }}>투자의견·목표가 이력</div><KISOpinionPanel data={opinion} loading={opinionLoading} error={opinionError} isUs={isUsChart} /></div></div>}
          {activeTab === "news" && <div id="news-panel" role="tabpanel" aria-labelledby="news-tab"><NewsPanel items={news} loading={newsLoading} error={newsError} /></div>}
        </div>
      </div>
    </div>,
    document.body
  );
}
