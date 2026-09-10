"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDisplayAmount } from "@/lib/display-number";
import { ChartModal } from "@/components/chart-modal";
import styles from "./ticker-chart-workbench.module.css";

type ScanSort =
  | "marketCapDesc"
  | "marketCapAsc"
  | "rvolDesc"
  | "rvolAsc"
  | "turnoverDesc"
  | "turnoverAsc"
  | "latestDateDesc"
  | "latestDateAsc"
  | "nameAsc"
  | "codeAsc";

function compareNullableNumber(a: unknown, b: unknown, direction: 1 | -1) {
  const av = typeof a === "number" && Number.isFinite(a) ? a : Number(a);
  const bv = typeof b === "number" && Number.isFinite(b) ? b : Number(b);
  const aMissing = !Number.isFinite(av);
  const bMissing = !Number.isFinite(bv);
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1;
  return (av - bv) * direction;
}

function compareScanRows(a: any, b: any, sort: ScanSort, rvolKey: string) {
  let result = 0;
  switch (sort) {
    case "marketCapDesc": result = compareNullableNumber(b.marketCap, a.marketCap, 1); break;
    case "marketCapAsc": result = compareNullableNumber(a.marketCap, b.marketCap, 1); break;
    case "rvolDesc": result = compareNullableNumber(b.metrics?.[rvolKey], a.metrics?.[rvolKey], 1); break;
    case "rvolAsc": result = compareNullableNumber(a.metrics?.[rvolKey], b.metrics?.[rvolKey], 1); break;
    case "turnoverDesc": result = compareNullableNumber(b.turnoverRatio, a.turnoverRatio, 1); break;
    case "turnoverAsc": result = compareNullableNumber(a.turnoverRatio, b.turnoverRatio, 1); break;
    case "latestDateDesc": result = String(b.latestDate ?? b.candleDate ?? "").localeCompare(String(a.latestDate ?? a.candleDate ?? "")); break;
    case "latestDateAsc": result = String(a.latestDate ?? a.candleDate ?? "").localeCompare(String(b.latestDate ?? b.candleDate ?? "")); break;
    case "nameAsc": result = String(a.name ?? "").localeCompare(String(b.name ?? ""), "ko"); break;
    case "codeAsc": result = String(a.code ?? "").localeCompare(String(b.code ?? "")); break;
  }
  if (result !== 0) return result;
  return String(a.code ?? "").localeCompare(String(b.code ?? ""));
}

function isDomesticMarket(market: unknown) {
  return market === "KR" || market === "KOSPI" || market === "KOSDAQ" || market === "KRX";
}

function HelpMark({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`도움말: ${text}`}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 16,
          height: 16,
          marginLeft: 5,
          padding: 0,
          border: "1px solid #64748b",
          borderRadius: "50%",
          background: "rgba(51,65,85,.55)",
          color: "#e2e8f0",
          fontSize: 10,
          fontWeight: 800,
          lineHeight: 1,
          cursor: "help",
          verticalAlign: "1px",
        }}
      >
        ?
      </button>
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            zIndex: 30,
            left: "50%",
            bottom: "calc(100% + 9px)",
            width: 245,
            transform: "translateX(-50%)",
            padding: "10px 12px",
            border: "1px solid rgba(148,163,184,.35)",
            borderRadius: 10,
            background: "#111827",
            color: "#e5e7eb",
            fontSize: 12,
            fontWeight: 500,
            lineHeight: 1.5,
            textAlign: "left",
            boxShadow: "0 12px 28px rgba(2,6,23,.42)",
            pointerEvents: "none",
          }}
        >
          {text}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "50%",
              bottom: -5,
              width: 9,
              height: 9,
              transform: "translateX(-50%) rotate(45deg)",
              background: "#111827",
              borderRight: "1px solid rgba(148,163,184,.35)",
              borderBottom: "1px solid rgba(148,163,184,.35)",
            }}
          />
        </span>
      )}
    </span>
  );
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text) as { ok?: boolean; error?: unknown; results?: any[] };
  } catch {
    const contentType = response.headers.get("content-type") || "unknown";
    throw new Error(`종목 추출 API가 JSON이 아닌 응답을 반환했습니다. HTTP ${response.status} · ${contentType}`);
  }
}

export function TickerChartWorkbench() {
  const [input, setInput] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<"KR" | "US">("KR");
  const [minCap, setMinCap] = useState("300");
  const [maxCap, setMaxCap] = useState("");
  const [minRvol, setMinRvol] = useState("0");
  const [maxRvol, setMaxRvol] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [bbPosition, setBbPosition] = useState<
    "LOWER_TOUCH" | "BELOW_MIDDLE" | "ANY"
  >("LOWER_TOUCH");
  const [obvTrend, setObvTrend] = useState<"ANY" | "RISING" | "FALLING">("ANY");
  const [adlTrend, setAdlTrend] = useState<"ANY" | "RISING" | "FALLING">("ANY");
  const [goldenCross, setGoldenCross] = useState<"ANY" | "RECENT">("ANY");
  const [scanLogic, setScanLogic] = useState<"AND" | "OR">("AND");
  const [scanTimeframe, setScanTimeframe] = useState<"D" | "W" | "M">("D");
  const [scanAsOf, setScanAsOf] = useState("");
  const [scanExchanges, setScanExchanges] = useState<string[]>([]);
  const [ema9Conditions, setEma9Conditions] = useState<
    Record<"D" | "W" | "M", "ANY" | "ABOVE" | "NOT_ABOVE">
  >({ D: "ANY", W: "ANY", M: "ANY" });
  const [scanRows, setScanRows] = useState<any[]>([]);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [scanSort, setScanSort] = useState<ScanSort>("marketCapDesc");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const capUnit = market === "KR" ? "억원" : "달러";
  const capMultiplier = market === "KR" ? 100000000 : 1;
  const tickers = useMemo(
    () => [
      ...new Set(
        input
          .split(/[,,\n\s]+/)
          .map((value) => {
            const normalized = value.trim().toUpperCase();
            return market === "KR" && /^\d+$/.test(normalized)
              ? normalized.padStart(6, "0")
              : normalized;
          })
          .filter(Boolean),
      ),
    ],
    [input, market],
  );
  const chartItems = useMemo(() => {
    if (scanCompleted && scanRows.length) return scanRows.map((row) => ({ code: row.code, company: row.name || row.code, market: isDomesticMarket(row.market) ? "KR" as const : "US" as const }));
    return tickers.map((code) => ({ code, company: names[code] || code, market }));
  }, [market, names, scanCompleted, scanRows, tickers]);
  const selectedChartIndex = selected ? chartItems.findIndex((item) => item.code === selected && item.market === selectedMarket) : -1;
  const adjacentChartItems = selectedChartIndex >= 0 ? chartItems.slice(Math.max(0, selectedChartIndex - 1), selectedChartIndex + 2).map((item) => ({ code: item.market === "US" ? `US:${item.code}` : item.code, company: item.company })) : [];

  useEffect(() => {
    if (!tickers.length) {
      setNames({});
      return;
    }
    const controller = new AbortController();
    fetch(
      `/api/stock/lookup?market=${market}&codes=${encodeURIComponent(tickers.join(","))}`,
      { signal: controller.signal },
    )
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("lookup failed")),
      )
      .then((json: { names?: Record<string, string> }) =>
        setNames(json.names ?? {}),
      )
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setNames({});
      });
    return () => controller.abort();
  }, [market, tickers]);

  useEffect(() => {
    setMinCap(market === "KR" ? "300" : "100000000");
    setMaxCap("");
    setScanRows([]);
    setScanCompleted(false);
    setScanError(null);
    setScanExchanges([]);
  }, [market]);

  // 입력 티커가 바뀌면 이전 조건 검색 결과를 재사용하지 않는다.
  useEffect(() => {
    setScanRows([]);
    setScanCompleted(false);
  }, [input]);

  // 검색 조건이 바뀌면 재실행 전까지 이전 결과를 표시하지 않는다.
  useEffect(() => {
    setScanRows([]);
    setScanCompleted(false);
  }, [
    market, scanTimeframe, scanAsOf, scanLogic, scanExchanges, minCap, maxCap, minRvol, maxRvol, minPrice, maxPrice,
    bbPosition, obvTrend, adlTrend, goldenCross, ema9Conditions,
  ]);

  async function runScan() {
    setScanCompleted(false);
    setScanLoading(true);
    setScanError(null);
    setScanCompleted(false);
    try {
      const numericFields = [
        ["최소 시총", minCap], ["최대 시총", maxCap], ["최소 RVOL", minRvol],
        ["최대 RVOL", maxRvol], ["최저 종가", minPrice], ["최고 종가", maxPrice],
      ] as const;
      for (const [label, value] of numericFields) {
        if (value.trim() !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
          throw new Error(`${label} 조건은 0 이상의 숫자로 입력하세요.`);
        }
      }
      if (Number(maxCap) > 0 && Number(minCap) > 0 && Number(maxCap) < Number(minCap)) throw new Error("최대 시총은 최소 시총보다 작을 수 없습니다.");
      if (Number(maxRvol) > 0 && Number(minRvol) > 0 && Number(maxRvol) < Number(minRvol)) throw new Error("최대 RVOL은 최소 RVOL보다 작을 수 없습니다.");
      if (Number(maxPrice) > 0 && Number(minPrice) > 0 && Number(maxPrice) < Number(minPrice)) throw new Error("최고 종가는 최저 종가보다 작을 수 없습니다.");
      const prefix = scanTimeframe;
      const filters: any[] = [];
      if (Number(minCap) > 0)
        filters.push({
          field: "marketCap",
          operator: ">=",
          value: Number(minCap) * capMultiplier,
        });
      if (Number(maxCap) > 0)
        filters.push({
          field: "marketCap",
          operator: "<=",
          value: Number(maxCap) * capMultiplier,
        });
      if (Number(minRvol) > 0)
        filters.push({
          field: `${prefix}.rvol`,
          operator: ">=",
          value: Number(minRvol),
        });
      if (Number(maxRvol) > 0)
        filters.push({
          field: `${prefix}.rvol`,
          operator: "<=",
          value: Number(maxRvol),
        });
      if (Number(minPrice) > 0)
        filters.push({
          field: `${prefix}.close`,
          operator: ">=",
          value: Number(minPrice),
        });
      if (Number(maxPrice) > 0)
        filters.push({
          field: `${prefix}.close`,
          operator: "<=",
          value: Number(maxPrice),
        });
      if (bbPosition === "LOWER_TOUCH")
        filters.push({
          field: `${prefix}.bb.lowerTouch`,
          operator: "=",
          value: true,
        });
      if (bbPosition === "BELOW_MIDDLE")
        filters.push({
          field: `${prefix}.close`,
          operator: "<=",
          value: `${prefix}.bb.middle`,
        });
      if (obvTrend !== "ANY")
        filters.push({
          field: `${prefix}.obv.signalTrend`,
          operator: "=",
          value: obvTrend,
        });
      if (adlTrend !== "ANY")
        filters.push({
          field: `${prefix}.adl.signalTrend`,
          operator: "=",
          value: adlTrend,
        });
      if (goldenCross !== "ANY")
        filters.push({
          field: `${prefix}.emaGoldenCross`,
          operator: "=",
          value: true,
        });
      const response = await fetch("/api/screener/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          market,
          timeframe: scanTimeframe,
          asOf: scanAsOf || "LATEST",
          logic: scanLogic,
          ...(scanExchanges.length ? { exchange: scanExchanges } : {}),
          instrumentType: "COMMON_STOCK",
          status: "ACTIVE",
          filters,
          ranking: [{ field: `${prefix}.rvol`, direction: "DESC" }],
          ema9Conditions,
          limit: 100,
        }),
      });
      const json = await readJsonResponse(response);
      if (!response.ok) throw new Error(typeof json.error === "string" ? json.error : "추출 실패");
      setScanRows(json.results ?? []);
      setScanCompleted(true);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "추출 실패");
    } finally {
      setScanLoading(false);
    }
  }

  function resetScanConditions() {
    setScanTimeframe("D"); setScanAsOf(""); setScanLogic("AND"); setScanExchanges([]); setEma9Conditions({ D: "ANY", W: "ANY", M: "ANY" });
    setMinCap(market === "KR" ? "300" : "100000000"); setMaxCap(""); setMinRvol("0"); setMaxRvol("");
    setMinPrice(""); setMaxPrice(""); setBbPosition("ANY"); setObvTrend("ANY"); setAdlTrend("ANY"); setGoldenCross("ANY");
    setScanError(null); setScanRows([]); setScanCompleted(false);
  }

  return (
    <>
      <section className={styles.panel}>
        <label htmlFor="ticker-input" className={styles.label}>
          티커 입력
        </label>
        <textarea
          id="ticker-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            market === "KR"
              ? "예: 005930, 000270, 012330"
              : "예: AAPL, NVDA, MSFT"
          }
          className={styles.input}
          rows={4}
        />
        <div className={styles.modes} role="group" aria-label="시장 선택">
          <button
            type="button"
            className={market === "KR" ? styles.modeActive : styles.mode}
            onClick={() => setMarket("KR")}
            disabled={scanLoading}
          >
            국내
          </button>
          <button
            type="button"
            className={market === "US" ? styles.modeActive : styles.mode}
            onClick={() => setMarket("US")}
            disabled={scanLoading}
          >
            해외
          </button>
        </div>
        <p className={styles.hint}>
          쉼표, 공백, 줄바꿈으로 여러 종목을 입력할 수 있습니다.{" "}
          {market === "KR" ? "국내 종목코드" : "해외 티커"}를 입력하세요.
        </p>
        <div className={styles.scanBox}>
          <strong>조건으로 종목 추출</strong>
          <p className={styles.hint}>저장된 preset 추출은 비활성화되었습니다. 시장·봉·지표·거래량 조건을 직접 설정한 뒤 ‘종목 추출’을 실행하세요.</p>
          <div className={styles.scanFields}>
            <label>
              <span>
                기준 봉<HelpMark text="지표와 가격을 계산할 캔들 주기입니다." />
              </span>
              <select
                value={scanTimeframe}
                onChange={(e) =>
                  setScanTimeframe(e.target.value as "D" | "W" | "M")
                }
              >
                <option value="D">일봉</option>
                <option value="W">주봉</option>
                <option value="M">월봉</option>
              </select>
            </label>
            <label>
              <span>조건 결합 방식<HelpMark text="AND는 모든 조건을 만족해야 하고, OR는 하나 이상의 조건을 만족하면 통과합니다." /></span>
              <select value={scanLogic} onChange={(e) => setScanLogic(e.target.value as "AND" | "OR")}>
                <option value="AND">모든 조건(AND)</option>
                <option value="OR">하나 이상(OR)</option>
              </select>
            </label>
            <label>
              <span>기준일<HelpMark text="비워 두면 각 시장의 최신 완료 거래일을 사용합니다. 날짜를 지정하면 해당 날짜 이전의 완료봉만 사용합니다." /></span>
              <input type="date" value={scanAsOf} onChange={(e) => setScanAsOf(e.target.value)} />
            </label>
            <fieldset className={styles.ema9Fieldset}>
              <legend>거래소 범위</legend>
              {(market === "KR"
                ? [["KOSPI", "KOSPI"], ["KOSDAQ", "KOSDAQ"]]
                : [["NAS", "NASDAQ"], ["NYS", "NYSE"], ["AMS", "AMEX"]]
              ).map(([value, label]) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={scanExchanges.includes(value)}
                    onChange={(event) => setScanExchanges((current) => event.target.checked
                      ? [...current, value]
                      : current.filter((exchange) => exchange !== value))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <fieldset className={styles.ema9Fieldset}>
              <legend>EMA9 위치 조건</legend>
              {(
                [
                  ["D", "일봉"],
                  ["W", "주봉"],
                  ["M", "월봉"],
                ] as const
              ).map(([tf, label]) => (
                <label key={tf}>
                  <span>{label}</span>
                  <select
                    value={ema9Conditions[tf]}
                    onChange={(e) =>
                      setEma9Conditions((current) => ({
                        ...current,
                        [tf]: e.target.value as "ANY" | "ABOVE" | "NOT_ABOVE",
                      }))
                    }
                  >
                    <option value="ANY">제한 없음</option>
                    <option value="ABOVE">EMA9 이상</option>
                    <option value="NOT_ABOVE">EMA9 미만</option>
                  </select>
                </label>
              ))}
            </fieldset>
            <label>
              <span>
                최소 시총({capUnit})
                <HelpMark
                  text={`시가총액이 이 값 이상인 종목만 조회합니다. 현재 단위는 ${market === "KR" ? "억원" : "미국 달러"}입니다.`}
                />
              </span>
              <input
                inputMode="decimal"
                value={minCap}
                onChange={(e) => setMinCap(e.target.value)}
              />
            </label>
            <label>
              <span>
                최대 시총({capUnit})
                <HelpMark
                  text={`시가총액이 이 값 이하인 종목만 조회합니다. 현재 단위는 ${market === "KR" ? "억원" : "미국 달러"}입니다. 비워 두면 상한이 없습니다.`}
                />
              </span>
              <input
                inputMode="decimal"
                value={maxCap}
                onChange={(e) => setMaxCap(e.target.value)}
              />
            </label>
            <label>
              <span>
                최소 RVOL
                <HelpMark text="선택한 기준 봉의 RVOL이 이 값 이상인 종목만 조회합니다." />
              </span>
              <input
                value={minRvol}
                onChange={(e) => setMinRvol(e.target.value)}
              />
            </label>
            <label>
              <span>
                최대 RVOL
                <HelpMark text="선택한 기준 봉의 RVOL이 이 값 이하인 종목만 조회합니다." />
              </span>
              <input
                value={maxRvol}
                onChange={(e) => setMaxRvol(e.target.value)}
              />
            </label>
            <label>
              <span>
                최저 종가
                <HelpMark text="선택한 기준 봉의 종가가 이 값 이상인 종목만 조회합니다." />
              </span>
              <input
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </label>
            <label>
              <span>
                최고 종가
                <HelpMark text="선택한 기준 봉의 종가가 이 값 이하인 종목만 조회합니다." />
              </span>
              <input
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </label>
            <label>
              <span>
                BB 위치
                <HelpMark text="하단 터치/이탈은 저가가 BB 하단에 닿거나 밑으로 내려간 경우입니다. 중단선 이하는 종가가 BB 중단선 이하인 경우입니다." />
              </span>
              <select
                value={bbPosition}
                onChange={(e) =>
                  setBbPosition(
                    e.target.value as "LOWER_TOUCH" | "BELOW_MIDDLE" | "ANY",
                  )
                }
              >
                <option value="LOWER_TOUCH">하단 터치/이탈</option>
                <option value="BELOW_MIDDLE">중단선 이하</option>
                <option value="ANY">제한 없음</option>
              </select>
            </label>
            <label>
              <span>
                OBV Signal
                <HelpMark text="EMA(9) 기반 OBV Signal의 최근 방향입니다. 제한 없음을 선택하면 OBV 조건을 적용하지 않습니다." />
              </span>
              <select
                value={obvTrend}
                onChange={(e) =>
                  setObvTrend(e.target.value as "ANY" | "RISING" | "FALLING")
                }
              >
                <option value="ANY">선택 없음</option>
                <option value="RISING">상승세</option>
                <option value="FALLING">하락세</option>
              </select>
            </label>
            <label>
              <span>
                골든크로스
                <HelpMark text="선택한 기준 봉에서 EMA(9)가 EMA(20)를 최근 상향 돌파한 종목입니다." />
              </span>
              <select
                value={goldenCross}
                onChange={(e) =>
                  setGoldenCross(e.target.value as "ANY" | "RECENT")
                }
              >
                <option value="ANY">선택 없음</option>
                <option value="RECENT">최근 상향 돌파</option>
              </select>
            </label>
            <label>
              <span>
                ADL Signal
                <HelpMark text="EMA(9) 기반 ADL Signal의 최근 방향입니다. 제한 없음을 선택하면 ADL 조건을 적용하지 않습니다." />
              </span>
              <select
                value={adlTrend}
                onChange={(e) =>
                  setAdlTrend(e.target.value as "ANY" | "RISING" | "FALLING")
                }
              >
                <option value="ANY">선택 없음</option>
                <option value="RISING">상승세</option>
                <option value="FALLING">하락세</option>
              </select>
            </label>
            <button type="button" onClick={runScan} disabled={scanLoading}>
              {scanLoading ? "추출 중…" : "종목 추출"}
            </button>
            <button type="button" onClick={resetScanConditions} disabled={scanLoading}>조건 초기화</button>
          </div>
          {scanError && <p className={styles.error}>{scanError}</p>}
        </div>
      </section>
      {scanCompleted && (
        <section className={styles.results}>
          <div className={styles.resultHeader}>
            <div>
              <h2>조건 추출 결과</h2>
              <span>{scanRows.length}개</span>
            </div>
            {scanRows.length > 0 && (
              <label className={styles.sortControl}>
                정렬
                <select
                  value={scanSort}
                  onChange={(e) =>
                    setScanSort(
                      e.target.value as ScanSort,
                    )
                  }
                >
                  <option value="marketCapDesc">시총 큰 순</option>
                  <option value="marketCapAsc">시총 작은 순</option>
                  <option value="rvolDesc">RVOL 높은 순</option>
                  <option value="rvolAsc">RVOL 낮은 순</option>
                  <option value="turnoverDesc">거래대금/시총 높은 순</option>
                  <option value="turnoverAsc">거래대금/시총 낮은 순</option>
                  <option value="latestDateDesc">최신 기준일 순</option>
                  <option value="latestDateAsc">오래된 기준일 순</option>
                  <option value="nameAsc">종목명 가나다순</option>
                  <option value="codeAsc">종목코드 오름차순</option>
                </select>
              </label>
            )}
          </div>
          {scanRows.length === 0 ? (
            <p className={styles.empty}>
              현재 조건과 캐시 기준을 모두 만족하는 종목이 없습니다.
            </p>
          ) : (
            <div className={styles.grid}>
              {[...scanRows]
                .sort((a, b) => compareScanRows(a, b, scanSort, `${scanTimeframe}.rvol`))
                .map((row) => (
                  <article
                    key={`${row.market}:${row.code}`}
                    className={styles.card}
                  >
                    <div>
                      <strong>{row.name}</strong>
                      <small>
                        {row.code} · {row.market} · 시총{" "}
                        {row.marketCap == null
                          ? "-"
                          : formatDisplayAmount(
                              Number(row.marketCap),
                              isDomesticMarket(row.market)
                                ? "KRW"
                                : "USD",
                            )}{" "}
                        · RVOL{" "}
                        {row.metrics?.[`${scanTimeframe}.rvol`] == null
                          ? "-"
                          : Number(
                              row.metrics[`${scanTimeframe}.rvol`],
                            ).toFixed(2)}
                      </small>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setNames((n) => ({ ...n, [row.code]: row.name }));
                        setSelectedCompany(row.name || row.code);
                        setSelectedMarket(
                          isDomesticMarket(row.market)
                            ? "KR"
                            : "US",
                        );
                        setSelected(row.code);
                      }}
                    >
                      차트 보기
                    </button>
                  </article>
                ))}
            </div>
          )}
        </section>
      )}

      <section className={styles.results} aria-live="polite">
        <div className={styles.resultHeader}>
          <h2>입력 종목</h2>
          <span>{tickers.length}개</span>
        </div>
        {!tickers.length ? (
          <p className={styles.empty}>
            티커를 입력하면 차트 버튼이 표시됩니다.
          </p>
        ) : (
          <div className={styles.grid}>
            {tickers.map((ticker) => (
              <article key={ticker} className={styles.card}>
                <div>
                  <strong>
                    {ticker}
                    {names[ticker] ? ` · ${names[ticker]}` : ""}
                  </strong>
                  <small>
                    {market === "KR" ? "국내 종목코드" : "해외 티커"}
                  </small>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompany(names[ticker] || ticker);
                    setSelectedMarket(market);
                    setSelected(ticker);
                  }}
                >
                  차트 보기
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <ChartModal
          code={selectedMarket === "US" ? `US:${selected}` : selected}
          company={selectedCompany || names[selected] || selected}
          position={selectedChartIndex >= 0 ? { current: selectedChartIndex + 1, total: chartItems.length } : undefined}
          prefetchCodes={adjacentChartItems}
          onPrevious={selectedChartIndex > 0 ? () => { const item = chartItems[selectedChartIndex - 1]; setSelectedMarket(item.market); setSelectedCompany(item.company); setSelected(item.code); } : undefined}
          onNext={selectedChartIndex >= 0 && selectedChartIndex < chartItems.length - 1 ? () => { const item = chartItems[selectedChartIndex + 1]; setSelectedMarket(item.market); setSelectedCompany(item.company); setSelected(item.code); } : undefined}
          onClose={() => {
            setSelected(null);
            setSelectedCompany(null);
          }}
        />
      )}
    </>
  );
}
