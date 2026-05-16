"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import { formatTime, getNaverFinanceLink, isStrongBullish, minutesAgo } from "@/lib/utils";
import type { DartItem, FeedPayload } from "@/lib/types";
import { PageNavigation } from "./page-navigation";
import styles from "./rapid-dart-page.module.css";

const RECENT_WINDOW_MINUTES = 5;

function sortRapidItems(items: DartItem[]): DartItem[] {
  return [...items].sort((left, right) => {
    const leftStrong = isStrongBullish(left) ? 1 : 0;
    const rightStrong = isStrongBullish(right) ? 1 : 0;

    if (leftStrong !== rightStrong) {
      return rightStrong - leftStrong;
    }

    return new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
  });
}

export function RapidDartPage() {
  const [data, setData] = useState<FeedPayload<DartItem> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      try {
        const response = await fetch("/api/dart", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("DART 급속 페이지 데이터를 불러오지 못했습니다.");
        }

        const payload = (await response.json()) as FeedPayload<DartItem>;
        if (!cancelled) {
          setData(payload);
          setError(null);
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "급속 페이지 로딩 실패");
          setLoading(false);
        }
      }
    }

    function stopPolling() {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function startPolling() {
      stopPolling();
      if (document.visibilityState !== "visible") {
        return;
      }

      intervalRef.current = window.setInterval(() => {
        void loadFeed();
      }, GLOBAL_POLLING_INTERVAL);
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadFeed();
        startPolling();
        return;
      }

      stopPolling();
    }

    void loadFeed();
    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, []);

  const items = useMemo(() => sortRapidItems(data?.items ?? []), [data]);
  const topItems = items.slice(0, 12);
  const strongCount = items.filter((item) => isStrongBullish(item)).length;
  const recentCount = items.filter((item) => minutesAgo(item.publishedAt) <= RECENT_WINDOW_MINUTES).length;

  return (
    <main className={styles.page}>
      <PageNavigation current="dart-rapid" />
      <header className={styles.hero}>
        <div>
          <div className={styles.liveIndicator}>
            <span className={styles.pulseDot}></span>
            LIVE MONITORING
          </div>
          <p className={styles.kicker}>KOREA STOCK FAST TRACK</p>
          <h1>국내 주식 급속 호재</h1>
          <p className={styles.description}>
            DART 호재 공시를 실시간으로 추적합니다. <br/>
            가중치 기반 AI 로직으로 엄선된 <strong>최강호재</strong>를 실시간으로 확인하세요.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/dart" className={styles.secondary}>
            일반 DART 화면
          </Link>
          <Link href="/dart/opendart-fast" className={styles.secondary}>
            OPEN DART 빠른 공시
          </Link>
        </div>
      </header>

      <section className={styles.stats}>
        <article className={styles.statCard}>
          <span>새로고침</span>
          <strong>{GLOBAL_POLLING_INTERVAL / 1000}초</strong>
        </article>
        <article className={styles.statCard}>
          <span>금일 호재 수</span>
          <strong>{items.length}건</strong>
        </article>
        <article className={styles.statCard}>
          <span>최강호재</span>
          <strong>{strongCount}건</strong>
        </article>
        <article className={styles.statCard}>
          <span>최근 {RECENT_WINDOW_MINUTES}분</span>
          <strong>{recentCount}건</strong>
        </article>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>빠른 확인 리스트</h2>
            <p>최강호재 우선, 그다음 최신순입니다.</p>
          </div>
          <span className={styles.meta}>
            {loading ? "불러오는 중" : `갱신 ${data?.fetchedAt ? formatTime(data.fetchedAt) : "-"}`}
          </span>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {topItems.length > 0 ? (
          <div className={styles.feed}>
            {topItems.map((item) => {
              const recent = minutesAgo(item.publishedAt) <= RECENT_WINDOW_MINUTES;
              return (
                <article key={item.link} className={styles.card}>
                  <div className={styles.cardTop}>
                    {isStrongBullish(item) ? (
                      <span className={styles.strongBadge}>최강호재</span>
                    ) : (
                      <span className={styles.normalBadge}>{item.judgment}</span>
                    )}
                    {recent ? <span className={styles.flashBadge}>방금 공시</span> : null}
                    <time>{formatTime(item.publishedAt, true)}</time>
                  </div>

                  <div className={styles.companyRow}>
                    <strong className={styles.company}>{item.company}</strong>
                    <a
                      href={getNaverFinanceLink(item.company)}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.chartBtn}
                    >
                      <span>차트</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
                      </svg>
                    </a>
                  </div>

                  <a href={item.link} target="_blank" rel="noreferrer" className={styles.title}>
                    {item.title}
                  </a>

                  <div className={styles.keywordRow}>
                    {item.keywords.length > 0 ? (
                      item.keywords.slice(0, 3).map((keyword) => (
                        <span key={`${item.link}-${keyword}`} className={styles.keyword}>
                          {keyword}
                        </span>
                      ))
                    ) : (
                      <span className={styles.keywordEmpty}>키워드 없음</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className={styles.empty}>현재 표시할 국내 주식 호재 공시가 없습니다.</p>
        )}
      </section>
    </main>
  );
}
