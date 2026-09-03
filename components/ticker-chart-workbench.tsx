"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "./ticker-chart-workbench.module.css";

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

export function TickerChartWorkbench() {
  const [input, setInput] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<"KR" | "US">("KR");
  const [minCap, setMinCap] = useState("1000");
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
  const [lowerTouch, setLowerTouch] = useState(true);
  const [scanTimeframe, setScanTimeframe] = useState<"D" | "W" | "M">("D");
  const [ema9Conditions, setEma9Conditions] = useState<
    Record<"D" | "W" | "M", "ANY" | "ABOVE" | "NOT_ABOVE">
  >({ D: "ANY", W: "ANY", M: "ANY" });
  const [scanRows, setScanRows] = useState<any[]>([]);
  const [scanCompleted, setScanCompleted] = useState(false);
  const [scanSort, setScanSort] = useState<
    "marketCapDesc" | "marketCapAsc" | "rvolDesc"
  >("marketCapDesc");
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [accumulationLoading, setAccumulationLoading] = useState(false);
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

  useEffect(() => {
    if (!tickers.length) {
      setNames({});
      return;
    }
    fetch(
      `/api/stock/lookup?market=${market}&codes=${encodeURIComponent(tickers.join(","))}`,
    )
      .then((response) =>
        response.ok
          ? response.json()
          : Promise.reject(new Error("lookup failed")),
      )
      .then((json: { names?: Record<string, string> }) =>
        setNames(json.names ?? {}),
      )
      .catch(() => setNames({}));
  }, [market, tickers]);

  useEffect(() => {
    setMinCap(market === "KR" ? "1000" : "100000000");
    setMaxCap("");
  }, [market]);

  async function runScan() {
    setScanLoading(true);
    setScanError(null);
    setScanCompleted(false);
    try {
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
          instrumentType: "COMMON_STOCK",
          status: "ACTIVE",
          filters,
          ranking: [{ field: `${prefix}.rvol`, direction: "DESC" }],
          ema9Conditions,
          limit: 100,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "추출 실패");
      setScanRows(json.results ?? []);
      setScanCompleted(true);
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "추출 실패");
    } finally {
      setScanLoading(false);
    }
  }

  async function runAccumulationScan() {
    setAccumulationLoading(true);
    setScanError(null);
    try {
      const response = await fetch("/api/scan/kr-accumulation?limit=100");
      const json = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.error ?? "매집 의심 종목 추출 실패");
      setScanRows(json.results ?? []);
      setScanCompleted(true);
      setMarket("KR");
    } catch (error) {
      setScanError(
        error instanceof Error ? error.message : "매집 의심 종목 추출 실패",
      );
    } finally {
      setAccumulationLoading(false);
    }
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
          >
            국내
          </button>
          <button
            type="button"
            className={market === "US" ? styles.modeActive : styles.mode}
            onClick={() => setMarket("US")}
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
          <div className={styles.scanFields}>
            <button
              type="button"
              onClick={runAccumulationScan}
              disabled={accumulationLoading}
            >
              {accumulationLoading
                ? "매집 후보 추출 중…"
                : "매집 의심 종목 추출"}
            </button>
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
                      e.target.value as
                        "marketCapDesc" | "marketCapAsc" | "rvolDesc",
                    )
                  }
                >
                  <option value="marketCapDesc">시총 큰 순</option>
                  <option value="marketCapAsc">시총 작은 순</option>
                  <option value="rvolDesc">RVOL 높은 순</option>
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
                .sort((a, b) => {
                  if (scanSort === "rvolDesc")
                    return (
                      Number(b.metrics?.[`${scanTimeframe}.rvol`] ?? -1) -
                      Number(a.metrics?.[`${scanTimeframe}.rvol`] ?? -1)
                    );
                  const av = Number(a.marketCap ?? -1),
                    bv = Number(b.marketCap ?? -1);
                  return scanSort === "marketCapAsc" ? av - bv : bv - av;
                })
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
                          : Number(row.marketCap).toLocaleString()}{" "}
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
                          row.market === "KOSPI" || row.market === "KOSDAQ"
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
          onClose={() => {
            setSelected(null);
            setSelectedCompany(null);
          }}
        />
      )}
    </>
  );
}
