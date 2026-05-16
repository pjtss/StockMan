"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBAL_POLLING_INTERVAL, PAGE_SIZE } from "@/lib/constants";
import { formatTime, getJudgmentStatus, paginateItems, sortByPublishedAtDesc } from "@/lib/utils";
import type { DartItem, DartJudgment, FeedPayload, SecItem, SecSentiment } from "@/lib/types";
import { PageNavigation } from "./page-navigation";
import { usePushDebug } from "./push-provider";
import { getWatchlist, toggleWatchlist } from "@/lib/watchlist";
import { MarketSentiment } from "./market-sentiment";
import styles from "./feed-page.module.css";

type ViewMode = "latest" | "grouped";

type FeedPageProps =
  | {
      type: "dart";
      title: string;
      description: string;
    }
  | {
      type: "sec";
      title: string;
      description: string;
    };

function judgmentClass(value: string): string {
  if (value === "최강호재") return styles.strongGood;
  const status = getJudgmentStatus(value);
  if (status === "good") return styles.good;
  if (status === "warn") return styles.warn;
  return styles.neutral;
}

function DartSections({ items, watchlist, onToggleWatchlist }: { items: DartItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void }) {
  const orders: DartJudgment[] = ["최강호재", "호재가능"];

  return (
    <div className={styles.groupList}>
      {orders.map((judgment) => {
        const sectionItems = items.filter((item) => item.judgment === judgment);
        if (sectionItems.length === 0) {
          return null;
        }

        return (
          <section key={judgment} className={styles.groupSection}>
            <div className={styles.groupHeader}>
              <h2>{judgment}</h2>
              <span>{sectionItems.length}건</span>
            </div>
            <DartTable items={sectionItems} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} />
          </section>
        );
      })}
    </div>
  );
}

function DartTable({ items, watchlist, onToggleWatchlist }: { items: DartItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>즐겨찾기</th>
            <th>등급</th>
            <th>회사명</th>
            <th>공시 제목</th>
            <th>키워드</th>
            <th>공시 시각</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isWatched = watchlist.includes(item.company);
            return (
              <tr key={item.link} className={isWatched ? styles.watchlistRow : ""}>
                <td>
                  <button
                    type="button"
                    className={`${styles.starButton} ${isWatched ? styles.starActive : ""}`}
                    onClick={() => onToggleWatchlist(item.company)}
                  >
                    {isWatched ? "★" : "☆"}
                  </button>
                </td>
                <td>
                  <span className={`${styles.badge} ${judgmentClass(item.judgment)}`}>{item.judgment}</span>
                </td>
                <td>
                  {item.company}
                  {isWatched && <span className={styles.watchlistBadge}>관심</span>}
                </td>
                <td>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </td>
                <td>{item.keywords.join(", ") || "-"}</td>
                <td>{formatTime(item.publishedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SecSections({ items, watchlist, onToggleWatchlist }: { items: SecItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void }) {
  const orders: SecSentiment[] = ["호재가능"];

  return (
    <div className={styles.groupList}>
      {orders.map((sentiment) => {
        const sectionItems = items.filter((item) => item.sentiment === sentiment);
        if (sectionItems.length === 0) {
          return null;
        }

        return (
          <section key={sentiment} className={styles.groupSection}>
            <div className={styles.groupHeader}>
              <h2>{sentiment}</h2>
              <span>{sectionItems.length}건</span>
            </div>
            <SecTable items={sectionItems} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} />
          </section>
        );
      })}
    </div>
  );
}

function SecTable({ items, watchlist, onToggleWatchlist }: { items: SecItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>즐겨찾기</th>
            <th>등급</th>
            <th>폼</th>
            <th>회사명</th>
            <th>공시 제목</th>
            <th>공시 시각</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const isWatched = watchlist.includes(item.company);
            return (
              <tr key={item.accession || item.link} className={isWatched ? styles.watchlistRow : ""}>
                <td>
                  <button
                    type="button"
                    className={`${styles.starButton} ${isWatched ? styles.starActive : ""}`}
                    onClick={() => onToggleWatchlist(item.company)}
                  >
                    {isWatched ? "★" : "☆"}
                  </button>
                </td>
                <td>
                  <span className={`${styles.badge} ${judgmentClass(item.sentiment)}`}>{item.sentiment}</span>
                </td>
                <td>{item.formType}</td>
                <td>
                  {item.company}
                  {isWatched && <span className={styles.watchlistBadge}>관심</span>}
                </td>
                <td>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                </td>
                <td>{formatTime(item.publishedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FeedPage(props: FeedPageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dartData, setDartData] = useState<FeedPayload<DartItem> | null>(null);
  const [secData, setSecData] = useState<FeedPayload<SecItem> | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("latest");
  const [page, setPage] = useState(1);
  const [pushTesting, setPushTesting] = useState(false);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const intervalRef = useRef<number | null>(null);
  const { status: pushStatus, enablePush, updatePreferences, refreshStatus, enabling, saving } = usePushDebug();

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  const handleToggleWatchlist = (company: string) => {
    setWatchlist(toggleWatchlist(company));
  };

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      try {
        const response = await fetch(props.type === "dart" ? "/api/dart" : "/api/sec", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("RSS 응답을 가져오는 데 실패했습니다.");
        }

        if (props.type === "dart") {
          const data = (await response.json()) as FeedPayload<DartItem>;
          if (!cancelled) {
            setDartData(data);
          }
        } else {
          const data = (await response.json()) as FeedPayload<SecItem>;
          if (!cancelled) {
            setSecData(data);
          }
        }

        if (!cancelled) {
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
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
      } else {
        stopPolling();
      }
    }

    void loadFeed();
    startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, [props.type]);

  useEffect(() => {
    setPage(1);
  }, [props.type, viewMode]);

  const dartItems = paginateItems(rawDartItems, currentPage, PAGE_SIZE);
  const secItems = paginateItems(rawSecItems, currentPage, PAGE_SIZE);

  // 시장 감성 지수 계산 로직 (DB 없이 현재 데이터 기반)
  const calculateSentiment = () => {
    const items = props.type === "dart" ? rawDartItems : rawSecItems;
    if (items.length === 0) return 50;

    if (props.type === "dart") {
      const strongCount = (items as DartItem[]).filter(i => i.judgment === "최강호재").length;
      const normalCount = items.length - strongCount;
      // 최강호재 100점, 일반호재 60점 기준으로 가중 평균
      const score = ((strongCount * 100) + (normalCount * 60)) / items.length;
      return Math.min(100, Math.max(0, score));
    } else {
      // SEC는 현재 호재가능만 필터링되므로 75점 기본값에서 데이터 양에 따라 보정
      return Math.min(90, 60 + (items.length * 2));
    }
  };

  const sentimentScore = calculateSentiment();
  const sentimentLabel = sentimentScore > 80 ? "EXTREME BULLISH" : sentimentScore > 60 ? "BULLISH" : "NEUTRAL";

  async function handleEnablePush() {
    try {
      await enablePush();
      await refreshStatus();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "알림 활성화 실패");
    }
  }

  async function handleToggleAll() {
    try {
      if (!pushStatus?.subscriptionExists) {
        await handleEnablePush();
        return;
      }

      const enabled = !(pushStatus.enabled ?? true);
      await updatePreferences({
        enabled,
        dartEnabled: enabled ? (pushStatus.dartEnabled ?? true) : false,
        secEnabled: enabled ? (pushStatus.secEnabled ?? true) : false,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "푸시 설정 변경 실패");
    }
  }

  async function handleToggleSource(source: "dart" | "sec") {
    try {
      if (!pushStatus?.subscriptionExists) {
        await handleEnablePush();
        return;
      }

      if (source === "dart") {
        const nextDart = !(pushStatus.dartEnabled ?? true);
        await updatePreferences({
          enabled: true,
          dartEnabled: nextDart,
          secEnabled: pushStatus.secEnabled ?? true,
        });
      } else {
        const nextSec = !(pushStatus.secEnabled ?? true);
        await updatePreferences({
          enabled: true,
          dartEnabled: pushStatus.dartEnabled ?? true,
          secEnabled: nextSec,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "푸시 설정 변경 실패");
    }
  }

  async function handleTestPush() {
    try {
      setPushTesting(true);
      const response = await fetch("/api/push/test", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("테스트 푸시 전송 실패");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "테스트 푸시 전송 실패");
    } finally {
      setPushTesting(false);
    }
  }

  return (
    <main className={styles.page}>
      <PageNavigation current={props.type} />

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>{props.type === "dart" ? "KOREA DISCLOSURES" : "U.S. FILINGS"}</p>
          <h1>{props.title}</h1>
          <p className={styles.description}>{props.description}</p>
          <div className={styles.sentimentWrap}>
            <MarketSentiment score={sentimentScore} label={sentimentLabel} />
          </div>
        </div>
        <div className={styles.statusCard}>
          <strong>{loading ? "불러오는 중" : "실행 중"}</strong>
          <span>새로고침 주기 {GLOBAL_POLLING_INTERVAL / 1000}초</span>
          <span>표시 건수 {count}건</span>
          <span>페이지 {currentPage} / {totalPages}</span>
          <span>갱신 시각 {fetchedAt ? formatTime(fetchedAt) : "-"}</span>
          <div className={styles.pushDebug}>
            <span>푸시 지원: {pushStatus?.supported ? "예" : "아니오"}</span>
            <span>권한: {pushStatus?.permission ?? "-"}</span>
            <span>현재 기기 구독 존재: {pushStatus?.subscriptionExists ? "예" : "아니오"}</span>
            <span>현재 기기 DB 저장: {pushStatus?.currentDeviceSaved ? "예" : "아니오"}</span>
            <span>전체 푸시: {pushStatus?.enabled === false ? "꺼짐" : "켜짐"}</span>
            <span>DART 푸시: {pushStatus?.dartEnabled === false ? "꺼짐" : "켜짐"}</span>
            <span>SEC 푸시: {pushStatus?.secEnabled === false ? "꺼짐" : "켜짐"}</span>
            <span>저장된 구독 수: {pushStatus?.savedCount ?? 0}</span>
            <span>최근 저장 시각: {pushStatus?.lastSaved ? formatTime(pushStatus.lastSaved) : "-"}</span>
            <span>최근 User-Agent: {pushStatus?.latestUserAgent ?? "-"}</span>
            <span>Endpoint: {pushStatus?.endpoint ? "있음" : "없음"}</span>
            {pushStatus?.error ? <span>오류: {pushStatus.error}</span> : null}
          </div>

          <button
            type="button"
            className={styles.enableButton}
            onClick={handleEnablePush}
            disabled={enabling || !pushStatus?.supported}
          >
            {enabling ? "알림 활성화 중.." : "알림 권한/구독 활성화"}
          </button>

          <div className={styles.toggleRow}>
            <button type="button" className={styles.toggleButton} onClick={handleToggleAll} disabled={saving}>
              {pushStatus?.enabled === false ? "전체 푸시 켜기" : "전체 푸시 끄기"}
            </button>
            <button type="button" className={styles.toggleButton} onClick={() => handleToggleSource("dart")} disabled={saving}>
              {pushStatus?.dartEnabled === false ? "DART 푸시 켜기" : "DART 푸시 끄기"}
            </button>
            <button type="button" className={styles.toggleButton} onClick={() => handleToggleSource("sec")} disabled={saving}>
              {pushStatus?.secEnabled === false ? "SEC 푸시 켜기" : "SEC 푸시 끄기"}
            </button>
          </div>

          <button type="button" className={styles.testButton} onClick={handleTestPush} disabled={pushTesting}>
            {pushTesting ? "전송 중.." : "테스트 푸시 보내기"}
          </button>
        </div>
      </section>

      {error ? <div className={styles.error}>{error}</div> : null}

      <section className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLabel}>보기 방식</div>
          <div className={styles.segmented}>
            <button
              type="button"
              className={viewMode === "latest" ? styles.segmentActive : styles.segment}
              onClick={() => setViewMode("latest")}
            >
              최신순
            </button>
            <button
              type="button"
              className={viewMode === "grouped" ? styles.segmentActive : styles.segment}
              onClick={() => setViewMode("grouped")}
            >
              분류별
            </button>
          </div>
        </div>
        {props.type === "dart" ? (
          dartItems.length > 0 ? (
            viewMode === "latest" ? (
              <DartTable items={dartItems} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
            ) : (
              <DartSections items={dartItems} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
            )
          ) : (
            <p className={styles.empty}>현재 조건에 맞는 DART 호재 공시가 없습니다.</p>
          )
        ) : secItems.length > 0 ? (
          viewMode === "latest" ? (
            <SecTable items={secItems} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
          ) : (
            <SecSections items={secItems} watchlist={watchlist} onToggleWatchlist={handleToggleWatchlist} />
          )
        ) : (
          <p className={styles.empty}>현재 조건에 맞는 SEC 호재 공시가 없습니다.</p>
        )}
        {count > PAGE_SIZE ? (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              이전
            </button>
            <span className={styles.pageInfo}>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
            >
              다음
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
