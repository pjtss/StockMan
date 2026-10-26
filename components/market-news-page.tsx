"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MARKET_NEWS_SOURCES, type MarketNewsKind } from "@/lib/market-news-contract";

type Item = {
  title: { original: string; ko: string | null };
  link: string;
};
type FeedResponse = {
  ok: boolean;
  items?: Item[];
  page?: { pageSize: number; returned: number; nextCursor: string | null; hasMore: boolean };
  scope?: { window: { from: string; to: string; hours: number } };
};

function readInitialFilters() {
  if (typeof window === "undefined") return { hours: 1, source: "ALL", ticker: "", kind: "ALL" };
  const params = new URLSearchParams(window.location.search);
  const hours = Number(params.get("hours") || 1);
  const requestedSource = params.get("source") || "ALL";
  const requestedKind = params.get("kind") || "ALL";
  return {
    hours: Number.isInteger(hours) && hours >= 1 && hours <= 24 ? hours : 1,
    source: requestedSource === "ALL" || MARKET_NEWS_SOURCES.some((item) => item.id === requestedSource) ? requestedSource : "ALL",
    ticker: params.get("ticker") || "",
    kind: requestedKind === "NEWS" || requestedKind === "FILING" ? requestedKind : "ALL",
  };
}

export function MarketNewsPage() {
  const initial = useMemo(readInitialFilters, []);
  const [hours, setHours] = useState(initial.hours);
  const [source, setSource] = useState(initial.source);
  const [tickerInput, setTickerInput] = useState(initial.ticker);
  const [ticker, setTicker] = useState(initial.ticker.trim().toUpperCase());
  const [kind, setKind] = useState(initial.kind as MarketNewsKind);
  const [items, setItems] = useState<Item[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"ko" | "original">("ko");
  const [refresh, setRefresh] = useState(0);
  const loadMoreAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const urlHours = Number(params.get("hours") || 1);
      setHours(Number.isInteger(urlHours) && urlHours >= 1 && urlHours <= 24 ? urlHours : 1);
      const urlSource = params.get("source") || "ALL";
      setSource(urlSource === "ALL" || MARKET_NEWS_SOURCES.some((item) => item.id === urlSource) ? urlSource : "ALL");
      const urlTicker = params.get("ticker") || "";
      setTickerInput(urlTicker);
      setTicker(urlTicker.trim().toUpperCase());
      const urlKind = params.get("kind") || "ALL";
      setKind(urlKind === "NEWS" || urlKind === "FILING" ? urlKind : "ALL");
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setTicker(tickerInput.trim().toUpperCase()), 250);
    return () => window.clearTimeout(timer);
  }, [tickerInput]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of ["hours", "source", "ticker", "kind"]) params.delete(key);
    params.set("hours", String(hours));
    if (source !== "ALL") params.set("source", source);
    if (ticker) params.set("ticker", ticker);
    if (kind !== "ALL") params.set("kind", kind);
    const query = params.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [hours, source, ticker, kind]);

  const loadFirstPage = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLoadingMore(false);
    setError(false);
    setItems([]);
    setNextCursor(null);
    const params = new URLSearchParams({ hours: String(hours), source, kind, pageSize: "50" });
    if (ticker) params.set("ticker", ticker);
    try {
      const response = await fetch(`/api/market-news?${params.toString()}`, { cache: "no-store", signal });
      const body = await response.json() as FeedResponse;
      if (!response.ok || !body.ok) throw new Error("feed unavailable");
      setItems(body.items ?? []);
      setNextCursor(body.page?.nextCursor ?? null);
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [hours, source, ticker, kind]);

  useEffect(() => {
    const controller = new AbortController();
    loadMoreAbort.current?.abort();
    loadMoreAbort.current = null;
    void loadFirstPage(controller.signal);
    return () => {
      controller.abort();
      loadMoreAbort.current?.abort();
      loadMoreAbort.current = null;
    };
  }, [loadFirstPage, refresh]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const controller = new AbortController();
    loadMoreAbort.current = controller;
    setLoadingMore(true);
    setError(false);
    const params = new URLSearchParams({ hours: String(hours), source, kind, pageSize: "50", cursor: nextCursor });
    if (ticker) params.set("ticker", ticker);
    try {
      const response = await fetch(`/api/market-news?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const body = await response.json() as FeedResponse;
      if (!response.ok || !body.ok) throw new Error("feed unavailable");
      if (controller.signal.aborted) return;
      setItems((current) => [...current, ...(body.items ?? [])]);
      setNextCursor(body.page?.nextCursor ?? null);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
      if (loadMoreAbort.current === controller) loadMoreAbort.current = null;
    }
  };

  return (
    <section className="marketNewsBoard" aria-label="해외 뉴스 피드">
      <div className="marketNewsBoardHead">
        <div>
          <h2>최신 해외 뉴스·공시</h2>
          <p>{loading ? "불러오는 중입니다." : `${items.length}개 제목`}</p>
        </div>
        <div className="marketNewsViewToggle" role="group" aria-label="제목 표시 언어">
          <button type="button" aria-pressed={view === "ko"} onClick={() => setView("ko")}>한국어 제목</button>
          <button type="button" aria-pressed={view === "original"} onClick={() => setView("original")}>원문 제목</button>
        </div>
      </div>

      <div className="marketNewsFilters">
        <fieldset className="marketNewsHours">
          <legend>최근 몇 시간</legend>
          <div className="marketNewsHourChips">
            {Array.from({ length: 24 }, (_, index) => index + 1).map((value) => (
              <button key={value} type="button" aria-pressed={hours === value} className={hours === value ? "active" : ""} onClick={() => setHours(value)}>{value}시간</button>
            ))}
          </div>
        </fieldset>
        <div className="marketNewsFilterRow">
          <label>출처
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              <option value="ALL">전체 출처</option>
              {MARKET_NEWS_SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>유형
            <select value={kind} onChange={(event) => setKind(event.target.value as MarketNewsKind)}>
              <option value="ALL">뉴스·공시 전체</option>
              <option value="NEWS">뉴스</option>
              <option value="FILING">SEC 공시</option>
            </select>
          </label>
          <label>티커
            <input value={tickerInput} onChange={(event) => setTickerInput(event.target.value)} placeholder="예: AAPL" maxLength={10} />
          </label>
        </div>
      </div>

      {error && <div className="marketNewsNotice" role="alert"><span>뉴스를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</span><button type="button" onClick={() => setRefresh((value) => value + 1)}>다시 시도</button></div>}
      {loading ? <div className="marketNewsEmpty" role="status">선택한 조건의 뉴스를 불러오는 중입니다.</div>
        : items.length === 0 && !error ? <div className="marketNewsEmpty"><strong>조건에 맞는 뉴스가 없습니다.</strong><p>기간, 출처 또는 티커를 바꿔 다시 확인해 보세요.</p><button type="button" onClick={() => { setHours(1); setSource("ALL"); setTickerInput(""); setTicker(""); setKind("ALL"); }}>필터 초기화</button></div>
          : <>
            <div className="marketNewsList">
              {items.map((item) => {
                const displayTitle = view === "ko" && item.title.ko ? item.title.ko : item.title.original;
                return (
                  <article className="marketNewsRow" key={`${item.link}-${item.title.original}`}>
                    <strong className="marketNewsTitle"><a href={item.link} target="_blank" rel="noreferrer">{displayTitle}</a></strong>
                  </article>
                );
              })}
            </div>
            {nextCursor && <button className="marketNewsLoadMore" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "불러오는 중…" : "더 보기"}</button>}
          </>}
    </section>
  );
}
