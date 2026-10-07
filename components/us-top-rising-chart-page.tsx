"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChartModal } from "@/components/chart-modal";
import styles from "./us-top-rising-chart-page.module.css";

type Item = {
  market: "NAS" | "AMS" | "NYS";
  code: string;
  name?: string;
  rank?: number;
  changeRate?: number | null;
  priority?: number;
  focusRank?: number;
  turnoverToMarketCap?: number;
  priorityReasons?: string[];
  focusTracking?: boolean;
};

type MarketStatus = {
  market: string;
  status: number;
  responseOk: boolean;
  sourceCount: number;
  requestedCount: number;
  sourceComplete: boolean;
  selectedCount: number;
  eligibleCommonStockCount: number;
  productExcluded: number;
  invalidRows: number;
  duplicateExcluded: number;
  fallbackUsed: boolean;
  collectedAt: string | null;
  error?: string | null;
  warning?: string | null;
  kis?: { rtCd?: string | null; msgCd?: string | null; msg1?: string | null };
};

const EXCHANGE_ORDER = ["NAS", "AMS", "NYS"];

export function UsTopRisingChartPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [collectedAt, setCollectedAt] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());
  const [complete, setComplete] = useState(false);
  const [markets, setMarkets] = useState<MarketStatus[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [market, setMarket] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stock/us/top-rising-chart", { cache: "no-store" });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? body?.message ?? `HTTP ${response.status}`);
      setItems(Array.isArray(body.items) ? body.items : []);
      setCollectedAt(body.collectedAt ?? null);
      setComplete(Boolean(body.complete));
      setMarkets(Array.isArray(body.markets) ? body.markets : []);
      setNotice(body.items?.length ? null : body.message ?? "현재 조회 가능한 상승률 데이터가 없습니다.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "조회에 실패했습니다.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const dataTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15_000);
    const clockTimer = window.setInterval(() => setClockNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(dataTimer);
      window.clearInterval(clockTimer);
    };
  }, [load]);

  const visible = useMemo(() => {
    const filtered = market === "ALL" ? [...items] : items.filter((item) => item.market === market);
    return filtered.sort((a, b) => EXCHANGE_ORDER.indexOf(a.market) - EXCHANGE_ORDER.indexOf(b.market)
      || (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER));
  }, [items, market]);

  const selected = selectedKey == null ? -1 : visible.findIndex((item) => `${item.market}:${item.code}` === selectedKey);
  const current = selected >= 0 ? visible[selected] : null;
  const focusCandidates = useMemo(() => visible
    .filter((item) => item.focusTracking === true)
    .sort((a, b) => (a.focusRank ?? Number.MAX_SAFE_INTEGER) - (b.focusRank ?? Number.MAX_SAFE_INTEGER)), [visible]);

  const collectedAtMs = collectedAt ? Date.parse(collectedAt) : Number.NaN;
  const ageSeconds = Number.isFinite(collectedAtMs) ? Math.max(0, Math.floor((clockNow - collectedAtMs) / 1_000)) : null;
  const updateLabel = collectedAt
    ? `${new Date(collectedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })} KST · ${ageSeconds == null ? "경과 확인 불가" : `${ageSeconds}초 전`}`
    : "원천 시각 확인 불가";

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.eyebrow}>US MARKET · LIVE UNIVERSE</div>
        <div className={styles.heroRow}>
          <div>
            <h1>미국 상승률 <span>TOP 100</span></h1>
            <p>거래소별 KIS 상승률 상위 100행에서 공식 활성 보통주만 선별합니다. 순위는 거래소별 원천 순위입니다.</p>
          </div>
          <button className={styles.refresh} type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "목록 재조회 중…" : "↻ 서버 목록 다시 조회"}
          </button>
        </div>
        <div className={styles.stats}>
          <span><b>{items.length}</b> 필터 통과 종목</span>
          <span><b>{visible.length}</b> 현재 보기</span>
          <span><b>{focusCandidates.length}</b> 집중 탐지 후보</span>
          <span>원천 갱신 <b>{updateLabel}</b></span>
          <span>거래소 응답 <b>{markets.filter((item) => item.responseOk).length}/3</b></span>
          <span>100행 완전 수신 <b>{complete ? "예 · 3/3" : `${markets.filter((item) => item.sourceComplete).length}/3 · 일부 미완료`}</b></span>
        </div>
      </section>

      {markets.length > 0 && (
        <section className={styles.marketDiagnostics} aria-label="거래소별 데이터 수신 상태">
          {markets.map((item) => (
            <article key={item.market} className={item.sourceComplete ? styles.marketComplete : item.responseOk ? styles.marketPartial : styles.marketFailed}>
              <strong>{item.market}</strong>
              <span>{item.sourceComplete ? "100행 수신" : item.responseOk ? `부분 수신 ${item.sourceCount}/${item.requestedCount}` : "응답 실패"}</span>
              <small>원천 {item.sourceCount}행 · 상품 제외 {item.productExcluded} · 코드 누락 {item.invalidRows} · 중복 제외 {item.duplicateExcluded}</small>
              <small>필터·중복 제거 후 {item.selectedCount} · 최종 활성 보통주 {item.eligibleCommonStockCount}</small>
              {item.error && <small role="note">{item.error}</small>}
              {item.warning && <small role="note">복구 안내: {item.warning}</small>}
              {item.fallbackUsed && <small>전체 순위 재조회 적용</small>}
            </article>
          ))}
        </section>
      )}

      {(ageSeconds == null || ageSeconds > 60) && (
        <p className={styles.staleWarning} role="status">
          {ageSeconds == null
            ? "KIS 원천 수집 시각을 확인할 수 없습니다. 표시된 데이터의 최신성을 보장할 수 없습니다."
            : `마지막 KIS 원천 데이터가 ${ageSeconds}초 전입니다. 최신 실시간 데이터로 간주하지 마세요.`}
        </p>
      )}

      {focusCandidates.length > 0 && (
        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <div>
              <strong>집중 탐지 후보</strong>
              <small>실제 1분봉 조회 큐 순번 · 최대 30종목</small>
              {focusCandidates.some((item) => item.turnoverToMarketCap == null) && (
                <small>시총 또는 순위 거래대금 미확인 종목은 분봉 금액만 관측할 수 있고, 거래대금/시총 비율은 계산되지 않습니다.</small>
              )}
            </div>
          </div>
          <div className={styles.grid}>
            {focusCandidates.map((item) => (
              <article className={styles.card} key={`focus:${item.market}:${item.code}`}>
                <div className={styles.rank}>Q{String(item.focusRank ?? "—").padStart(2, "0")}</div>
                <div className={styles.identity}>
                  <strong title={item.name || item.code}>{item.name || "회사명 확인 중"}</strong>
                  <small>{item.code} <i>·</i> {item.market}</small>
                </div>
                <div className={styles.change}>
                  <b>{item.turnoverToMarketCap == null ? "미확인" : `${(item.turnoverToMarketCap * 100).toFixed(2)}%`}</b>
                  <small>거래대금/시총</small>
                </div>
                <button className={styles.chartButton} type="button" onClick={() => setSelectedKey(`${item.market}:${item.code}`)}>
                  차트 보기 <span>→</span>
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div>
            <strong>상승률 랭킹</strong>
            <small>거래소별 KIS 원천 순위</small>
          </div>
          <div className={styles.filters} role="group" aria-label="거래소 필터">
            {["ALL", ...EXCHANGE_ORDER].map((value) => (
              <button
                className={market === value ? styles.activeFilter : ""}
                key={value}
                type="button"
                onClick={() => { setMarket(value); setSelectedKey(null); }}
                aria-pressed={market === value}
              >
                {value === "ALL" ? "전체" : value}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className={styles.stateError} role="alert">
            <strong>데이터를 불러오지 못했습니다.</strong>
            <span>{error}</span>
            <button type="button" onClick={() => void load()}>다시 시도</button>
          </div>
        )}
        {loading && !items.length && <div className={styles.state}><span className={styles.spinner} />실제 상승률 데이터를 불러오는 중입니다.</div>}
        {notice && !error && <div className={styles.state} role="status">{notice}</div>}

        <div className={styles.grid}>
          {visible.map((item, index) => (
            <article className={styles.card} key={`${item.market}:${item.code}`}>
              <div className={styles.rank}>#{String(item.rank ?? index + 1).padStart(2, "0")}</div>
              <div className={styles.identity}>
                <strong title={item.name || item.code}>{item.name || "회사명 확인 중"}</strong>
                <small>{item.code} <i>·</i> {item.market}</small>
              </div>
              <div className={styles.change}>
                <b>{item.changeRate == null ? "미확인" : `${item.changeRate > 0 ? "+" : ""}${item.changeRate}%`}</b>
                <small>등락률</small>
              </div>
              <button className={styles.chartButton} type="button" onClick={() => setSelectedKey(`${item.market}:${item.code}`)}>
                차트 보기 <span>→</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      {current && (
        <ChartModal
          code={`US:${current.code}`}
          company={current.name || current.code}
          exchange={current.market}
          position={{ current: selected + 1, total: visible.length }}
          onClose={() => setSelectedKey(null)}
          onPrevious={selected > 0 ? () => setSelectedKey(`${visible[selected - 1].market}:${visible[selected - 1].code}`) : undefined}
          onNext={selected < visible.length - 1 ? () => setSelectedKey(`${visible[selected + 1].market}:${visible[selected + 1].code}`) : undefined}
          prefetchCodes={visible.slice(Math.max(0, selected - 1), selected + 2)
            .filter((_, index) => index !== selected)
            .map((item) => ({ code: `US:${item.code}`, company: item.name || item.code, exchange: item.market }))}
        />
      )}
    </main>
  );
}
