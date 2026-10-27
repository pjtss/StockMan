"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDisplayDateTime } from "@/lib/display-number";

type Item = {
  id: number;
  source: string;
  title: string;
  translatedTitle: string | null;
  summary: string | null;
  link: string;
  publishedAt: string | null;
  detectedTicker: string | null;
};

const REFRESH_INTERVAL_MS = 10_000;

export function MarketNewsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const requestInFlight = useRef(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (requestInFlight.current || document.visibilityState !== "visible") return;
    requestInFlight.current = true;
    setRefreshing(true);
    setError(null);

    try {
      const params = new URLSearchParams({ limit: "200" });
      if (source) params.set("source", source);
      const response = await fetch(`/api/market-news?${params.toString()}`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const body: { ok?: boolean; items?: Item[] } = await response.json();
      if (!body.ok || !Array.isArray(body.items)) throw new Error("INVALID_RESPONSE");
      setItems(body.items);
      setLastUpdatedAt(new Date());
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError("뉴스를 새로 불러오지 못했습니다. 잠시 후 다시 시도합니다.");
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [source]);

  useEffect(() => {
    if (document.visibilityState === "visible") void load();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, REFRESH_INTERVAL_MS);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [load]);

  const sources = [...new Set(items.map((item) => item.source))].sort();

  return (
    <section className="marketNewsBoard" aria-label="해외 뉴스 피드">
      <div className="marketNewsBoardHead">
        <div>
          <h2>최신순 통합 피드</h2>
          <p>
            {items.length}건 · 발행 시각 내림차순
            <span aria-live="polite">
              {refreshing ? " · 업데이트 중" : lastUpdatedAt ? ` · ${formatDisplayDateTime(lastUpdatedAt.toISOString())} 갱신` : ""}
            </span>
          </p>
        </div>
        <select aria-label="뉴스 출처" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="">전체 출처</option>
          {sources.map((itemSource) => <option key={itemSource} value={itemSource}>{itemSource}</option>)}
        </select>
      </div>
      {error ? <div className="marketNewsEmpty" role="alert">{error}</div> : null}
      {loading ? <div className="marketNewsEmpty">불러오는 중입니다.</div> : (
        <div className="marketNewsList" aria-live="polite">
          {items.map((item) => (
            <article className="marketNewsRow" key={item.id}>
              <div className="marketNewsRowMain">
                <small>{item.source}{item.detectedTicker ? ` · ${item.detectedTicker}` : ""} · {item.publishedAt ? formatDisplayDateTime(item.publishedAt) : "시각 미확인"}</small>
                <strong><a href={item.link} target="_blank" rel="noreferrer">{item.translatedTitle || item.title}</a></strong>
                {item.summary ? <p><small>원문 요약 · 미번역</small><br />{item.summary}</p> : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
