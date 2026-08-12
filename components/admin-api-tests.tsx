"use client";

import { useState } from "react";
import { Copy, Play } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { AdminPageShell } from "@/components/admin-page-shell";
import styles from "@/app/admin/page.module.css";

type Result = {
  ok?: boolean;
  status?: number;
  httpStatus?: number;
  [key: string]: unknown;
};

function readRequestTrace(response: Response) {
  return {
    requestId: response.headers.get("x-request-id"),
    serverTiming: response.headers.get("server-timing"),
    debugStatus: response.headers.get("x-debug-status"),
    debugReason: response.headers.get("x-debug-reason"),
  };
}

type RawResponse = { path: string; value: string };

function collectRawResponses(value: unknown, path = "$", depth = 0, output: RawResponse[] = []) {
  if (depth > 8 || value == null) return output;
  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (key === "rawText" && typeof child === "string" && child.trim()) output.push({ path: childPath, value: child });
      else if (key !== "rawTextPreview") collectRawResponses(child, childPath, depth + 1, output);
    }
  } else if (Array.isArray(value)) {
    value.forEach((child, index) => collectRawResponses(child, `${path}[${index}]`, depth + 1, output));
  }
  return output;
}

type TestKey = "debug_suite" | "us_updown" | "us_price_detail" | "us_trade_trend" | "us_trade_collect" | "discord_ticker" | "kis_token" | "us_free_float" | "us_free_float_refresh" | "us_product_classification" | "short_interest" | "us_turnover" | "us_intensity" | "us_top_rising" | "us_turnover_ratio" | "us_turnover_watchlist" | "us_vwap" | "us_bollinger_band" | "kr_bollinger_band" | "kr_instruments_sync" | "kr_daily_cache" | "us_top100_upsert" | "us_obv" | "us_daily_obv" | "us_mfi" | "us_macd" | "us_dmi" | "us_daily_breakout" | "us_daily_cache" | "us_daily_open_cache" | "us_news_radar" | "us_news_ticker" | "us_news_radar_events" | "market_rss" | "market_rss_signal" | "sec_raw" | "sec_edgar";
type ApiTestDefinition = {
  key: TestKey;
  label: string;
  description: string;
  endpoint: string;
  query: string;
};

const TESTS: ApiTestDefinition[] = [
  {
    key: "debug_suite",
    label: "전체 기능 디버깅 스위트",
    description: "환경·DB 스키마·KIS 토큰·자동화·RSS·SEC 저장 상태를 한 번에 점검",
    endpoint: "/api/admin/debug-suite",
    query: "",
  },
  {
    key: "us_updown",
    label: "미국 상승률 TOP N",
    description: "KIS 해외주식 상승률 순위 원본 응답",
    endpoint: "/api/admin/kis-us-test",
    query: "excd=NAS",
  },
  {
    key: "us_price_detail",
    label: "미국 현재가 상세",
    description: "시가총액·거래대금·시가·고가 원본 응답",
    endpoint: "/api/admin/kis-us-price-detail-test",
    query: "code=TOPS&market=AMS",
  },
  {
    key: "us_turnover",
    label: "해외 거래대금 추이",
    description: "해외주식 분봉 기반 거래대금 응답",
    endpoint: "/api/stock/us/turnover-trend",
    query: "code=AAPL&market=NAS",
  },
  {
    key: "us_intensity",
    label: "미국 체결강도",
    description: "미국 체결강도 랭킹 응답",
    endpoint: "/api/stock/us/intensity",
    query: "",
  },
  {
    key: "us_top_rising",
    label: "미국 상승률 스캐너",
    description: "상승률 TOP N 스캐너 가공 응답",
    endpoint: "/api/stock/top-rising",
    query: "",
  },
  {
    key: "us_turnover_ratio",
    label: "시총 대비 거래대금 스캐너",
    description: "미국 상승률 TOP 100 중 시총 대비 거래대금 1~10% 필터 응답",
    endpoint: "/api/admin/us-turnover-ratio-test",
    query: "",
  },
  {
    key: "us_turnover_watchlist",
    label: "관심종목 시총 대비 거래대금",
    description: "등록된 관심종목만 상세 시세 조회·필터 판정·단계별 디버깅",
    endpoint: "/api/admin/us-turnover-watchlist-test",
    query: "send=false",
  },
  { key: "us_vwap", label: "미국 당일 VWAP 상회", description: "AMS·NAS·NYS 관심종목의 당일 전체 세션 VWAP 비교", endpoint: "/api/admin/us-vwap-test", query: "" },
  { key: "us_bollinger_band", label: "미국 일봉 볼린저밴드 하단 이탈", description: "통합 티커 전체의 DB 완료 일봉 종가와 하단선 비교·필터 진단", endpoint: "/api/admin/us-bollinger-band-test", query: "" },
  { key: "kr_bollinger_band", label: "국내 일봉 볼린저밴드 하단 이탈", description: "국내 통합 티커 전체의 DB 일봉 종가와 하단선 비교·필터 진단", endpoint: "/api/admin/kr-bollinger-band-test", query: "" },
  { key: "kr_instruments_sync", label: "국내 통합 티커 KIS 동기화", description: "KIS 국내 랭킹에서 국내 전용 통합 티커 테이블 UPSERT", endpoint: "/api/admin/kr-instruments-sync-test", query: "" },
  { key: "kr_daily_cache", label: "국내 일봉·시세 DB 갱신", description: "국내 통합 티커의 KIS 일봉과 시총·거래대금 원본 응답 저장", endpoint: "/api/admin/kr-daily-cache-test", query: "" },
  { key: "us_top100_upsert", label: "미국 TOP100 통합 티커 UPSERT", description: "NAS·AMS·NYS TOP100에서 ETF·레버리지 제외 후 통합 테이블 반영", endpoint: "/api/admin/us-top-rising-upsert-test", query: "" },
  {
    key: "us_trade_trend",
    label: "미국 단일종목 체결강도",
    description: "KIS 체결추이 원본·vpow 체결강도·응답 진단",
    endpoint: "/api/admin/kis-us-trade-trend-test",
    query: "code=AAPL&market=NAS&day=1",
  },
  {
    key: "us_trade_collect",
    label: "미국 체결강도 수집·저장",
    description: "최근 체결추이를 DB에 중복 제거 저장(Discord 미전송)",
    endpoint: "/api/admin/us-trade-intensity-collect-test",
    query: "symbols=AAPL,TSLA&market=NAS&maxSymbols=2&delayMs=350",
  },
  {
    key: "discord_ticker",
    label: "Discord /ticker 종합 조회",
    description: "현재가·유동성·최근 체결강도 종합 응답",
    endpoint: "/api/admin/discord-ticker-overview-test",
    query: "code=AAPL",
  },
  {
    key: "kis_token",
    label: "KIS Access Token 상태",
    description: "DB 토큰의 발급 시각·공식 만료 시각·잔여 시간 확인(토큰 값은 노출하지 않음)",
    endpoint: "/api/admin/kis-token-debug",
    query: "",
  },
  {
    key: "us_free_float",
    label: "미국 유통주 조회",
    description: "FMP 무료 Free Float API 및 일일 DB 캐시",
    endpoint: "/api/admin/us-free-float-test",
    query: "ticker=AAPL",
  },
  { key: "us_free_float_refresh", label: "미국 유통주 전체 갱신", description: "통합 티커 전체를 대상으로 FMP 유통주 강제 갱신", endpoint: "/api/admin/us-free-float-refresh-test", query: "" },
  { key: "us_product_classification", label: "미국 ETF·레버리지 비활성화", description: "KIS 상품 유형을 확인하고 제외 상품을 INACTIVE_EXCLUDED 처리", endpoint: "/api/admin/us-product-classification-refresh-test", query: "" },
  {
    key: "short_interest",
    label: "미국 단일종목 공매도",
    description: "FINRA 무료 일별 공매도 거래량 조회",
    endpoint: "/api/admin/short-interest-test",
    query: "ticker=AAPL",
  },
  { key: "us_obv", label: "미국 당일 1분봉 OBV", description: "AMS·NAS·NYS 후보의 당일 1분봉 OBV 계산", endpoint: "/api/admin/us-obv-test", query: "" },
  { key: "us_daily_obv", label: "미국 일봉 OBV", description: "TOP100 종목의 DB 저장 일봉만으로 최근 5거래일 대비 OBV 상승 탐지", endpoint: "/api/admin/us-daily-obv-test", query: "" },
  { key: "us_mfi", label: "미국 MFI 과매도", description: "TOP100 종목의 DB 저장 일봉만으로 MFI 과매도 스캔", endpoint: "/api/admin/us-mfi-test", query: "period=14&threshold=30" },
  { key: "us_macd", label: "미국 MACD", description: "TOP100 종목의 DB 저장 일봉만으로 MACD 추세 스캔", endpoint: "/api/admin/us-macd-test", query: "" },
  { key: "us_dmi", label: "미국 DMI·ADX", description: "TOP100 종목의 DB 저장 일봉만으로 DMI·ADX 추세 스캔", endpoint: "/api/admin/us-dmi-test", query: "" },
  { key: "us_daily_breakout", label: "미국 일봉 5일 고가 돌파", description: "TOP100 종목의 DB 저장 일봉과 현재가를 비교(일봉 KIS 보충 조회 없음)", endpoint: "/api/admin/us-daily-breakout-test", query: "limit=30" },
  { key: "us_daily_cache", label: "미국 전체 일봉 데이터 갱신", description: "KIS에서 이전 일봉을 받아 DB에 저장하는 별도 갱신 기능", endpoint: "/api/admin/us-daily-cache-test", query: "" },
  { key: "us_daily_open_cache", label: "미국 당일 시가 DB 갱신", description: "현재 미국 시장일의 캔들만 KIS에서 조회해 DB에 UPSERT", endpoint: "/api/admin/us-daily-open-cache-test", query: "" },
  {
    key: "us_news_radar",
    label: "해외 뉴스 속보 레이더",
    description: "KIS 속보·미국 티커 검증 결과 확인",
    endpoint: "/api/admin/us-news-radar-test",
    query: "",
  },
  {
    key: "us_news_ticker",
    label: "미국 티커 기간별 뉴스",
    description: "KIS news-title 원본을 티커·오늘/3일/7일/1개월 기준으로 조회",
    endpoint: "/api/admin/us-news-ticker-test",
    query: "ticker=AAPL&period=7d",
  },
  {
    key: "us_news_radar_events",
    label: "해외 뉴스 처리 이력",
    description: "검증·Discord 전송·실패 상태와 재시도 횟수",
    endpoint: "/api/admin/us-news-radar-events",
    query: "",
  },
  {
    key: "market_rss",
    label: "시장 RSS 번역 테스트",
    description: "GlobeNewswire·NASDAQ·NASDAQ Trader·SEC·StockTitan RSS를 한국어 번역과 함께 확인",
    endpoint: "/api/admin/market-rss-test",
    query: "translate=true",
  },
  {
    key: "market_rss_signal",
    label: "RSS 호재 탐지 테스트",
    description: "실제 RSS 원문·SEC 8-K 본문에서 호재 신호·근거 점수 확인",
    endpoint: "/api/admin/market-rss-signal-test",
    query: "resolveSec=true&resolveMarket=true",
  },
  {
    key: "sec_raw",
    label: "SEC 원문 AI",
    description: "SEC 원문 파싱 및 AI 평가 응답",
    endpoint: "/api/admin/sec-raw-test",
    query: "",
  },
  { key: "sec_edgar", label: "SEC EDGAR 수집·분류·XBRL", description: "티커·CIK 매핑, Submissions 저장, Form/Item 분류, 선택적 Company Facts 저장", endpoint: "/api/admin/sec-edgar-test", query: "ticker=AAPL&facts=true" },
];

export function AdminApiTests() {
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TestKey | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [running, setRunning] = useState<TestKey | null>(null);
  const [secUrl, setSecUrl] = useState("https://www.sec.gov/");
  const [priceDetailCode, setPriceDetailCode] = useState("TOPS");
  const [priceDetailMarket, setPriceDetailMarket] = useState("AMS");
  const [tradeTrendCode, setTradeTrendCode] = useState("AAPL");
  const [tradeTrendMarket, setTradeTrendMarket] = useState("");
  const [tradeMinSamples, setTradeMinSamples] = useState("4");
  const [tradeMinIntensity, setTradeMinIntensity] = useState("100");
  const [tradeStrongScore, setTradeStrongScore] = useState("80");
  const [tradeWatchScore, setTradeWatchScore] = useState("60");
  const [tradeCollectSymbols, setTradeCollectSymbols] = useState("AAPL,TSLA");
  const [tickerOverviewCode, setTickerOverviewCode] = useState("AAPL");
  const [freeFloatTicker, setFreeFloatTicker] = useState("AAPL");
  const [shortInterestTicker, setShortInterestTicker] = useState("AAPL");
  const [secEdgarTicker, setSecEdgarTicker] = useState("AAPL");
  const [mfiPeriod, setMfiPeriod] = useState("14");
  const [mfiThreshold, setMfiThreshold] = useState("30");
  const [marketRssMode, setMarketRssMode] = useState<"FETCH_ONLY" | "PREVIEW">("FETCH_ONLY");
  const [copied, setCopied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  async function runTest(test: ApiTestDefinition) {
    setRunning(test.key);
    setCopied(false);
    setRawOpen(false);
    setError(null);
    try {
      const query = test.key === "sec_raw"
        ? `url=${encodeURIComponent(secUrl)}`
        : test.key === "sec_edgar"
          ? `ticker=${encodeURIComponent(secEdgarTicker)}&facts=true`
        : test.key === "us_price_detail"
          ? `code=${encodeURIComponent(priceDetailCode)}&market=${encodeURIComponent(priceDetailMarket)}`
          : test.key === "us_trade_trend"
            ? `code=${encodeURIComponent(tradeTrendCode)}${tradeTrendMarket ? `&market=${encodeURIComponent(tradeTrendMarket)}` : ""}&day=1&minSamples=${tradeMinSamples}&minIntensity=${tradeMinIntensity}&strongScore=${tradeStrongScore}&watchScore=${tradeWatchScore}`
              : test.key === "us_trade_collect"
                ? `symbols=${encodeURIComponent(tradeCollectSymbols)}&maxSymbols=10&delayMs=350`
                : test.key === "discord_ticker"
                  ? `code=${encodeURIComponent(tickerOverviewCode)}`
                : test.key === "us_free_float"
                  ? `ticker=${encodeURIComponent(freeFloatTicker)}`
                : test.key === "short_interest"
                  ? `ticker=${encodeURIComponent(shortInterestTicker)}`
                : test.key === "us_mfi"
                  ? `period=${encodeURIComponent(mfiPeriod)}&threshold=${encodeURIComponent(mfiThreshold)}`
              : test.key === "market_rss"
                ? `mode=${marketRssMode}&translate=true`
              : test.query;
      const response = await fetch(`${test.endpoint}${query ? `?${query}` : ""}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      const requestTrace = readRequestTrace(response);
      if (!response.ok) {
        const detail = data.error || data.message || data.msg1 || `HTTP ${response.status}`;
        const errorResult = { ...(typeof data === "object" && data !== null ? data : {}), ok: false, httpStatus: response.status, endpoint: test.endpoint, query, requestTrace, checkedAt: new Date().toISOString() } as Result;
        setResult(errorResult);
        setActive(test.key);
        setError(`${detail} [${test.endpoint}]`);
        return;
      }
      setResult({ ...(typeof data === "object" && data !== null ? data : {}), httpStatus: response.status, requestTrace });
      setActive(test.key);
      if (test.key === "kr_daily_cache" && typeof data?.jobId === "string") {
        const statusEndpoint = data.statusEndpoint as string;
        for (let attempt = 0; attempt < 180; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const statusResponse = await fetch(statusEndpoint, { cache: "no-store" });
          const statusData = await statusResponse.json().catch(() => ({}));
          const statusTrace = readRequestTrace(statusResponse);
          setResult({ ...(typeof statusData === "object" && statusData !== null ? statusData : {}), httpStatus: statusResponse.status, requestTrace: statusTrace });
          if (statusData?.status === "COMPLETED" || statusData?.status === "FAILED") break;
        }
      }
    } catch (testError) {
      const message = testError instanceof Error ? testError.message : String(testError);
      const errorResult = { ok: false, error: message, endpoint: test.endpoint, query: test.query, checkedAt: new Date().toISOString() };
      setResult(errorResult);
      setActive(test.key);
      setError(message);
    } finally {
      setRunning(null);
    }
  }

  const activeTest = TESTS.find((test) => test.key === active);

  return (
    <AdminPageShell
      eyebrow="DIAGNOSTICS"
      title="API 테스트"
      description="외부 API와 스캐너 엔드포인트를 수동 실행하고 원본 응답을 모달에서 확인합니다."
    >
      {error && <div className={`${styles.alert} ${styles.error}`}>{error}</div>}

      <section className={styles.statusGrid} aria-label="API 테스트 목록">
        {TESTS.map((test) => {
          const isRunning = running === test.key;
          return (
            <article key={test.key} className={styles.card}>
              <div className={styles.cardHeader}>
                <div>
                  <h2 className={styles.cardTitle}>{test.label}</h2>
                  <p className={styles.cardDesc}>{test.description}</p>
                </div>
                <span className={`${styles.state} ${isRunning ? styles.on : styles.off}`}>
                  {isRunning ? "실행 중" : "대기"}
                </span>
              </div>

              {test.key === "sec_raw" && (
                <label className={styles.inlineField}>
                  <span className={styles.fieldLabel}>SEC 원문 URL</span>
                  <input
                    className={styles.textInput}
                    value={secUrl}
                    onChange={(event) => setSecUrl(event.target.value)}
                    placeholder="https://www.sec.gov/Archives/edgar/data/..."
                  />
                </label>
              )}
              {test.key === "us_price_detail" && (
                <div className={styles.fieldGrid}>
                  <label className={styles.inlineField}>
                    <span className={styles.fieldLabel}>종목코드</span>
                    <input className={styles.textInput} value={priceDetailCode} onChange={(event) => setPriceDetailCode(event.target.value.toUpperCase())} placeholder="TOPS" />
                  </label>
                  <label className={styles.inlineField}>
                    <span className={styles.fieldLabel}>거래소</span>
                    <select className={styles.textInput} value={priceDetailMarket} onChange={(event) => setPriceDetailMarket(event.target.value)}>
                      <option value="AMS">AMS</option>
                      <option value="NAS">NAS</option>
                      <option value="NYSE">NYSE</option>
                    </select>
                  </label>
                </div>
              )}
              {test.key === "sec_edgar" && <label className={styles.inlineField}><span className={styles.fieldLabel}>티커</span><input className={styles.textInput} value={secEdgarTicker} onChange={(event) => setSecEdgarTicker(event.target.value.toUpperCase())} placeholder="AAPL" /></label>}
              {test.key === "us_trade_trend" && (
                <div className={styles.fieldGrid}>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>종목코드</span><input className={styles.textInput} value={tradeTrendCode} onChange={(event) => setTradeTrendCode(event.target.value.toUpperCase())} /></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>거래소(선택)</span><select className={styles.textInput} value={tradeTrendMarket} onChange={(event) => setTradeTrendMarket(event.target.value)}><option value="">미입력: NAS → AMS → NYS</option><option>NAS</option><option>AMS</option><option>NYS</option></select></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>최소 표본</span><input type="number" min="1" className={styles.textInput} value={tradeMinSamples} onChange={(event) => setTradeMinSamples(event.target.value)} /></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>평균 체결강도</span><input type="number" min="0" className={styles.textInput} value={tradeMinIntensity} onChange={(event) => setTradeMinIntensity(event.target.value)} /></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>강한 후보 점수</span><input type="number" min="0" className={styles.textInput} value={tradeStrongScore} onChange={(event) => setTradeStrongScore(event.target.value)} /></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>관찰 후보 점수</span><input type="number" min="0" className={styles.textInput} value={tradeWatchScore} onChange={(event) => setTradeWatchScore(event.target.value)} /></label>
                </div>
              )}
              {test.key === "us_trade_collect" && (
                <label className={styles.inlineField}><span className={styles.fieldLabel}>티커 목록(쉼표 구분)</span><input className={styles.textInput} value={tradeCollectSymbols} onChange={(event) => setTradeCollectSymbols(event.target.value.toUpperCase())} placeholder="AAPL,TSLA,NVDA" /></label>
              )}
              {test.key === "discord_ticker" && (
                <label className={styles.inlineField}><span className={styles.fieldLabel}>티커</span><input className={styles.textInput} value={tickerOverviewCode} onChange={(event) => setTickerOverviewCode(event.target.value.toUpperCase())} placeholder="AAPL" /></label>
              )}
              {test.key === "us_free_float" && (
                <label className={styles.inlineField}><span className={styles.fieldLabel}>티커</span><input className={styles.textInput} value={freeFloatTicker} onChange={(event) => setFreeFloatTicker(event.target.value.toUpperCase())} placeholder="AAPL" /></label>
              )}
          {test.key === "short_interest" && (
                <label className={styles.inlineField}><span className={styles.fieldLabel}>티커</span><input className={styles.textInput} value={shortInterestTicker} onChange={(event) => setShortInterestTicker(event.target.value.toUpperCase())} placeholder="AAPL" /></label>
              )}
              {test.key === "us_mfi" && (
                <div className={styles.fieldGrid}>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>기간</span><input type="number" min="2" className={styles.textInput} value={mfiPeriod} onChange={(event) => setMfiPeriod(event.target.value)} /></label>
                  <label className={styles.inlineField}><span className={styles.fieldLabel}>과매도 기준</span><input type="number" min="0" max="100" className={styles.textInput} value={mfiThreshold} onChange={(event) => setMfiThreshold(event.target.value)} /></label>
                </div>
              )}
              {test.key === "market_rss" && (
                <label className={styles.inlineField}>
                  <span className={styles.fieldLabel}>실행 모드</span>
                  <select className={styles.textInput} value={marketRssMode} onChange={(event) => setMarketRssMode(event.target.value as "FETCH_ONLY" | "PREVIEW")}>
                    <option value="FETCH_ONLY">FETCH_ONLY · 원문·번역 조회만</option>
                    <option value="PREVIEW">PREVIEW · 분류·호재 등급까지</option>
                  </select>
                  <small className={styles.cardDesc}>관리자 테스트는 저장·Discord 전송을 하지 않습니다. 실제 자동화는 cron COMMIT 경로에서 수행됩니다.</small>
                </label>
              )}

              <div className={styles.cardActions}>
                <button
                  className={styles.toggleButton}
                  onClick={() => void runTest(test)}
                  disabled={running !== null || (test.key === "sec_raw" && !secUrl.trim()) || (test.key === "us_price_detail" && !priceDetailCode.trim()) || (test.key === "us_trade_trend" && !tradeTrendCode.trim()) || (test.key === "us_trade_collect" && !tradeCollectSymbols.trim()) || (test.key === "discord_ticker" && !tickerOverviewCode.trim()) || (test.key === "us_free_float" && !freeFloatTicker.trim()) || (test.key === "short_interest" && !shortInterestTicker.trim()) || (test.key === "us_mfi" && (!mfiPeriod.trim() || !mfiThreshold.trim()))}
                >
                  <Play size={16} />
                  {isRunning ? "호출 중" : "실행"}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {result && activeTest && (
        <AdminModal
          title={activeTest.label}
          description="요청 정보와 원본 응답"
          onClose={() => {
            setActive(null);
            setResult(null);
            setRawOpen(false);
          }}
          wide
        >
          <div className={styles.resultHeader}>
            <span>HTTP 상태</span>
            <strong className={result.ok === false ? styles.resultError : styles.resultSuccess}>
              {String(result.httpStatus ?? result.status ?? "완료")}
            </strong>
          </div>
          {Boolean(result.requestTrace && typeof result.requestTrace === "object") && (
            <div className={styles.resultHeader}>
              <span>요청 추적</span>
              <strong>{String((result.requestTrace as { requestId?: string | null }).requestId || "자동 생성됨")} · {String((result.requestTrace as { serverTiming?: string | null }).serverTiming || "타이밍 없음")}</strong>
            </div>
          )}
          {Boolean(activeTest.key === "us_turnover_ratio" && result.debug && typeof result.debug === "object") && (
            <div className={styles.resultHeader}>
              <span>필터링 흐름</span>
              <strong>{String((result.debug as any).sourceCount ?? 0)}개 TOP 100 → price-detail {String((result.debug as any).priceDetailSuccessCount ?? 0)}건 성공 → 최종 {Array.isArray((result as any).filtered) ? (result as any).filtered.length : 0}개</strong>
            </div>
          )}
          {Boolean(activeTest.key === "us_news_radar" && Array.isArray(result.stages)) && (
            <div className={styles.resultHeader}>
              <span>처리 단계</span>
              <strong>{(result.stages as Array<{ name: string; count: number }>).map((stage) => `${stage.name}: ${stage.count}`).join(" → ")}</strong>
            </div>
          )}
          {Boolean(activeTest.key === "us_trade_trend" && result.analysis && typeof result.analysis === "object") && (() => {
            const analysis = result.analysis as { metrics?: { sampleCount?: number; latestIntensity?: number | null; recentAverageIntensity?: number | null; previousAverageIntensity?: number | null; intensityChange?: number | null; priceChange?: number | null; volumeChangeRate?: number | null }; score?: { score?: number; level?: string } };
            const metrics = analysis.metrics || {};
            const score = analysis.score || {};
            return <div className={styles.resultHeader}><span>체결강도 분석</span><strong>{score.level ?? "-"} {score.score ?? 0}점 · {metrics.sampleCount ?? 0}건 · 최근 평균 {metrics.recentAverageIntensity ?? "-"} · 직전 평균 {metrics.previousAverageIntensity ?? "-"} · 변화 {metrics.intensityChange ?? "-"}</strong></div>;
          })()}
          <div className={styles.cardActions}>
            {collectRawResponses(result).length > 0 && (
              <button className={styles.toggleButton} onClick={() => setRawOpen(true)}>
                원본 응답 보기
              </button>
            )}
            <button
              className={styles.toggleButton}
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              }}
            >
              <Copy size={16} />
              {copied ? "복사 완료" : "결과 JSON 복사"}
            </button>
          </div>
          <pre className={styles.codeBlock}>{JSON.stringify(result, null, 2)}</pre>
        </AdminModal>
      )}
      {result && activeTest && rawOpen && (() => {
        const rawResponses = collectRawResponses(result);
        const rawText = rawResponses.map((item) => `===== ${item.path} =====\n${item.value}`).join("\n\n");
        return <AdminModal title={`${activeTest.label} · KIS 원본 응답`} description="가공하지 않은 API 원문입니다. 필요한 경우 아래 버튼으로 복사할 수 있습니다." onClose={() => setRawOpen(false)} wide>
          <div className={styles.resultHeader}><span>원본 블록</span><strong>{rawResponses.length}개</strong></div>
          <div className={styles.cardActions}>
            <button className={styles.toggleButton} onClick={async () => { await navigator.clipboard.writeText(rawText); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }}>
              <Copy size={16} />
              {copied ? "원본 복사 완료" : "KIS 원본 응답 복사"}
            </button>
          </div>
          <pre className={styles.codeBlock}>{rawText}</pre>
        </AdminModal>;
      })()}
    </AdminPageShell>
  );
}
