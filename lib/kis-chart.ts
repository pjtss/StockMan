/**
 * lib/kis-chart.ts
 * KIS 국내 주식 일봉/분봉 조회 + 기술적 지표(RSI, MACD, 볼린저 밴드) 연산 모듈
 * Lazy Loading 전략: 사용자가 종목을 클릭할 때만 호출 (API Rate Limit 방지)
 */

import { getAccessToken } from "./kis";
import { kisRequest } from "./kis-request-framework";

const BASE_URL =
  process.env.KIS_MODE === "mock"
    ? "https://openapivts.koreainvestment.com:29443"
    : "https://openapi.koreainvestment.com:9443";

export interface OHLCVCandle {
  date: string; // YYYYMMDD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tradingValue?: number | null;
  raw?: unknown;
}

export interface TechnicalIndicators {
  rsi14: number | null;      // 14일 RSI
  macd: number | null;       // MACD 라인
  macdSignal: number | null; // Signal 라인
  macdHist: number | null;   // MACD 히스토그램
  bbUpper: number | null;    // 볼린저 밴드 상단
  bbMiddle: number | null;   // 볼린저 밴드 중간(20일 MA)
  bbLower: number | null;    // 볼린저 밴드 하단
}

export interface ChartData {
  code: string;
  company: string;
  candles: OHLCVCandle[];
  indicators: TechnicalIndicators;
  latestPrice: number;
  latestChange: string;
  latestChangeRate: string;
  fundamentals?: ChartFundamentals;
  candleDataUpdatedAt?: string | null;
}

export interface ChartFundamentals {
  marketCap: number | null;
  latestTradingValue: number | null;
  averageTradingValue20: number | null;
  latestVolume: number | null;
  averageVolume20: number | null;
  rvol: number | null;
  currency: string;
  observedAt: string | null;
  fetchedAt: string | null;
  source: string | null;
  status: "AVAILABLE" | "STALE" | "UNKNOWN";
}

/** KIS 일봉 API 호출 */
async function fetchDailyOHLCV(code: string, token: string, timeframe: "D" | "W" | "M" = "D"): Promise<OHLCVCandle[]> {
  const today = new Date();
  const endDate = today.toISOString().slice(0, 10).replace(/-/g, "");
  const lookbackDays = timeframe === "M" ? 365 * 5 : timeframe === "W" ? 365 * 2 : 60;
  const startDateObj = new Date(today.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  const startDate = startDateObj.toISOString().slice(0, 10).replace(/-/g, "");

  const url = new URL(`${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`);
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", startDate);
  url.searchParams.set("FID_INPUT_DATE_2", endDate);
  url.searchParams.set("FID_PERIOD_DIV_CODE", timeframe);
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const { response: res, parsed: json } = await kisRequest<any>({ url: url.toString(), token, trId: "FHKST03010100" });

  if (!res.ok) throw new Error(`KIS chart API HTTP ${res.status}`);
  if (json.rt_cd !== "0") {
    throw new Error(`KIS chart API error: ${json.msg1}`);
  }

  const output2: any[] = json.output2 ?? [];
  // KIS 응답 순서는 시장·환경에 따라 달라질 수 있으므로 날짜를 기준으로 정렬한다.
  return output2
    .filter((r: any) => r.stck_bsop_date && r.stck_clpr)
    .map((r: any) => ({
      date: r.stck_bsop_date as string,
      open: parseInt(r.stck_oprc, 10) || 0,
      high: parseInt(r.stck_hgpr, 10) || 0,
      low: parseInt(r.stck_lwpr, 10) || 0,
      close: parseInt(r.stck_clpr, 10) || 0,
      volume: parseInt(r.acml_vol, 10) || 0,
      tradingValue: Number(r.acml_tr_pbmn ?? 0) || null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** RSI 계산 (단순 Wilder's Smoothing) */
function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  let gains = 0;
  let losses = 0;

  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/** EMA 계산 */
function calcEMA(data: number[], period: number): number[] {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const emas: number[] = [];

  // EMA의 초기 시드: 첫 period 구간 평균. 이후 값은 EMA 재귀식으로 계산한다.
  const seed = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  emas.push(seed);

  for (let i = period; i < data.length; i++) {
    emas.push(data[i] * k + emas[emas.length - 1] * (1 - k));
  }
  return emas;
}

/** MACD 계산 */
function calcMACD(closes: number[]): { macd: number | null; signal: number | null; hist: number | null } {
  if (closes.length < 26) return { macd: null, signal: null, hist: null };

  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  // ema12, ema26 길이 맞추기
  const diff = ema12.length - ema26.length;
  const macdLine = ema26.map((v, i) => ema12[i + diff] - v);

  if (macdLine.length < 9) return { macd: null, signal: null, hist: null };

  const signal = calcEMA(macdLine, 9);
  const lastMacd = macdLine[macdLine.length - 1];
  const lastSignal = signal[signal.length - 1];

  return {
    macd: parseFloat(lastMacd.toFixed(2)),
    signal: parseFloat(lastSignal.toFixed(2)),
    hist: parseFloat((lastMacd - lastSignal).toFixed(2)),
  };
}

/** 볼린저 밴드 계산 (20일, 2σ) */
function calcBollingerBands(closes: number[], period = 20): { upper: number | null; middle: number | null; lower: number | null } {
  if (closes.length < period) return { upper: null, middle: null, lower: null };

  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const std = Math.sqrt(variance);

  return {
    upper: parseFloat((mean + 2 * std).toFixed(0)),
    middle: parseFloat(mean.toFixed(0)),
    lower: parseFloat((mean - 2 * std).toFixed(0)),
  };
}

/** 메인 함수: 차트 데이터 + 기술적 지표 반환 */
export async function fetchChartData(code: string, timeframe: "D" | "W" | "M" = "D"): Promise<ChartData | null> {
  const token = await getAccessToken();
  if (!token) {
    console.warn(`[CHART] No KIS token available for code ${code}`);
    return null;
  }

  const candles = await fetchDailyOHLCV(code, token, timeframe);
  if (candles.length === 0) return null;

  const closes = candles.map((c) => c.close);

  // 기술적 지표 연산
  const rsi14 = calcRSI(closes);
  const { macd, signal: macdSignal, hist: macdHist } = calcMACD(closes);
  const { upper: bbUpper, middle: bbMiddle, lower: bbLower } = calcBollingerBands(closes);

  // 최신 가격 정보
  const last = candles[candles.length - 1];
  const prev = candles.length > 1 ? candles[candles.length - 2] : null;
  const change = prev ? last.close - prev.close : 0;
  const changeRate = prev ? ((change / prev.close) * 100).toFixed(2) : "0.00";
  const changeStr = change >= 0 ? `+${change.toLocaleString()}` : change.toLocaleString();
  const changeRateStr = change >= 0 ? `+${changeRate}%` : `${changeRate}%`;

  return {
    code,
    company: code, // caller가 company 이름을 알고 있으므로 필요시 덮어씀
    candles,
    indicators: { rsi14, macd, macdSignal, macdHist, bbUpper, bbMiddle, bbLower },
    latestPrice: last.close,
    latestChange: changeStr,
    latestChangeRate: changeRateStr,
    candleDataUpdatedAt: new Date().toISOString(),
  };
}
