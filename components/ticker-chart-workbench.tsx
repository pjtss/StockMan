"use client";

import { useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "./ticker-chart-workbench.module.css";

export function TickerChartWorkbench() {
  const [input, setInput] = useState("");
  const [market, setMarket] = useState<"KR" | "US">("KR");
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const tickers = useMemo(
    () => [...new Set(input.split(/[,,\n\s]+/).map((value) => value.trim().toUpperCase()).filter(Boolean))],
    [input]
  );

  useEffect(() => {
    if (!tickers.length) { setNames({}); return; }
    fetch(`/api/stock/lookup?market=${market}&codes=${encodeURIComponent(tickers.join(","))}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("lookup failed")))
      .then((json: { names?: Record<string, string> }) => setNames(json.names ?? {}))
      .catch(() => setNames({}));
  }, [market, tickers]);

  return (
    <>
      <section className={styles.panel}>
        <label htmlFor="ticker-input" className={styles.label}>티커 입력</label>
        <textarea
          id="ticker-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={market === "KR" ? "예: 005930, 000270, 012330" : "예: AAPL, NVDA, MSFT"}
          className={styles.input}
          rows={4}
        />
        <div className={styles.modes} role="group" aria-label="시장 선택">
          <button type="button" className={market === "KR" ? styles.modeActive : styles.mode} onClick={() => setMarket("KR")}>국내</button>
          <button type="button" className={market === "US" ? styles.modeActive : styles.mode} onClick={() => setMarket("US")}>해외</button>
        </div>
        <p className={styles.hint}>쉼표, 공백, 줄바꿈으로 여러 종목을 입력할 수 있습니다. {market === "KR" ? "국내 종목코드" : "해외 티커"}를 입력하세요.</p>
      </section>

      <section className={styles.results} aria-live="polite">
        <div className={styles.resultHeader}>
          <h2>입력 종목</h2>
          <span>{tickers.length}개</span>
        </div>
        {!tickers.length ? <p className={styles.empty}>티커를 입력하면 차트 버튼이 표시됩니다.</p> : (
          <div className={styles.grid}>
            {tickers.map((ticker) => (
              <article key={ticker} className={styles.card}>
                <div><strong>{ticker}{names[ticker] ? ` · ${names[ticker]}` : ""}</strong><small>{market === "KR" ? "국내 종목코드" : "해외 티커"}</small></div>
                <button type="button" onClick={() => setSelected(ticker)}>차트 보기</button>
              </article>
            ))}
          </div>
        )}
      </section>
      {selected && <ChartModal code={market === "US" ? `US:${selected}` : selected} company={names[selected] || selected} onClose={() => setSelected(null)} />}
    </>
  );
}
