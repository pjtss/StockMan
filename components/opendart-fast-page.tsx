"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { GLOBAL_POLLING_INTERVAL } from "@/lib/constants";
import { marketLabel, sortByPublishedAtDesc } from "@/lib/utils";
import type { OpenDartFastItem, OpenDartFastPayload } from "@/lib/opendart-fast";
import type { VolumeSpikeItem, NetBuyingItem } from "@/lib/kis";
import { PageNavigation } from "./page-navigation";
import { KeywordManager } from "./keyword-manager";
import { DisclosureDetailBadge } from "./disclosure-detail-badge";
import { SectorMap } from "./sector-map";
import { ProgramTradingTracker } from "./program-trading";
import styles from "./opendart-fast-page.module.css";

function sortItems(items: OpenDartFastItem[]) {
  return [...items].sort((left, right) => {
    if (left.judgment !== right.judgment) {
      return left.judgment === "최강호재" ? -1 : 1;
    }

    return right.receiptNo.localeCompare(left.receiptNo);
  });
}

export function OpenDartFastPage() {
  const [payload, setPayload] = useState<OpenDartFastPayload | null>(null);
  const [volumeSpikes, setVolumeSpikes] = useState<VolumeSpikeItem[]>([]);
  const [netBuyings, setNetBuyings] = useState<NetBuyingItem[]>([]);
  const [customKeywords, setCustomKeywords] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [dartRes, volRes, netRes] = await Promise.all([
          fetch("/api/dart/opendart-fast", { cache: "no-store" }),
          fetch("/api/stock/volume-spike", { cache: "no-store" }).catch(() => null),
          fetch("/api/stock/net-buying", { cache: "no-store" }).catch(() => null),
        ]);

        if (!dartRes.ok) {
          const data = await dartRes.json().catch(() => null);
          throw new Error(data?.error || "OPEN DART 빠른 공시를 불러오지 못했습니다.");
        }

        const dartData = (await dartRes.json()) as OpenDartFastPayload;
        const volData = volRes?.ok ? ((await volRes.json()) as VolumeSpikeItem[]) : [];
        const netData = netRes?.ok ? ((await netRes.json()) as NetBuyingItem[]) : [];

        if (!cancelled) {
          setPayload(dartData);
          setVolumeSpikes(volData);
          setNetBuyings(netData);
          setError(null);
          setLoading(false);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "OPEN DART 빠른 공시 로딩 실패");
          setLoading(false);
        }
      }
    }

    function stop() {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    function start() {
      stop();
      if (document.visibilityState !== "visible") {
        return;
      }

      intervalRef.current = window.setInterval(() => {
        void load();
      }, GLOBAL_POLLING_INTERVAL);
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") {
        void load();
        start();
      } else {
        stop();
      }
    }

    void load();
    start();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const items = useMemo(() => sortItems(payload?.items ?? []), [payload]);
  const strongCount = items.filter((item) => item.judgment === "최강호재").length;

  return (
    <main className={styles.page}>
      <PageNavigation current="dart-opendart-fast" />
      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>OPEN DART FAST MONITOR</p>
          <h1>국내 주식 실시간 공시 스캐너</h1>
          <p className={styles.description}>
            OPEN DART 공시검색 API로 오늘 공시를 직접 조회합니다. RSS보다 공시유형을 세밀하게 걸러서 강한 호재를 우선
            확인하는 무료 전용 화면입니다.
          </p>
        </div>
        <div className={styles.links}>
          <Link href="/dart" className={styles.secondary}>
            일반 DART
          </Link>
        </div>
      </section>

      <section className={styles.stats}>
        <article className={styles.statCard}>
          <span>새로고침</span>
          <strong>{GLOBAL_POLLING_INTERVAL / 1000}초</strong>
        </article>
        <article className={styles.statCard}>
          <span>오늘 추출 건수</span>
          <strong>{items.length}건</strong>
        </article>
        <article className={styles.statCard}>
          <span>최강호재</span>
          <strong>{strongCount}건</strong>
        </article>
      </section>

      <div style={{ display: "flex", gap: "24px", marginBottom: "32px", flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: "300px" }}>
          <KeywordManager onKeywordsChange={setCustomKeywords} />
        </div>
        <div style={{ flex: 1, minWidth: "300px", marginTop: "-32px" }}>
          <SectorMap items={items.map(item => ({ company: item.corpName, title: item.reportName, judgment: item.judgment }))} />
        </div>
      </div>

      <ProgramTradingTracker />

      <section className={styles.panel}>
        <div className={styles.panelHeader}>
          <div>
            <h2>OPEN DART 강호재 리스트</h2>
            <p>최강호재 우선, 그다음 접수번호 내림차순입니다.</p>
          </div>
          <span className={styles.meta}>{loading ? "불러오는 중" : `갱신 ${payload?.fetchedAt ?? "-"}`}</span>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        {items.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>등급</th>
                  <th>시장</th>
                  <th>회사명</th>
                  <th>종목코드</th>
                  <th>보고서명</th>
                  <th>키워드</th>
                  <th>접수일</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const hasKeyword = customKeywords.some(
                    (kw) =>
                      item.reportName.includes(kw) ||
                      item.keywords.some((k) => k.includes(kw))
                  );
                  
                  return (
                    <tr key={item.receiptNo} className={hasKeyword ? styles.keywordHighlight : ""}>
                      <td>
                        <span className={item.judgment === "최강호재" ? styles.strongBadge : styles.normalBadge}>
                          {item.judgment}
                        </span>
                      </td>
                      <td>{marketLabel(item.corpCls)}</td>
                      <td>
                        <div className={styles.corpInfo}>
                          <span className={styles.corpName}>{item.corpName}</span>
                          {volumeSpikes.some((v) => v.code === item.stockCode) && (
                            <span className={styles.volBadge}>🔥 거래대금 폭발</span>
                          )}
                          {netBuyings.some((n) => n.code === item.stockCode) && (
                            <span className={styles.netBadge}>📈 수급 포착</span>
                          )}
                        </div>
                      </td>
                      <td>{item.stockCode || "-"}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                          <a href={item.link} target="_blank" rel="noreferrer">
                            {item.reportName}
                          </a>
                          {item.detailCategory && item.corpCode && (
                            <DisclosureDetailBadge corpCode={item.corpCode} category={item.detailCategory} />
                          )}
                        </div>
                      </td>
                      <td>{item.keywords.join(", ") || "-"}</td>
                      <td>{item.receiptDate || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          !error && <p className={styles.empty}>현재 조건에 맞는 OPEN DART 강호재 공시가 없습니다.</p>
        )}
      </section>
    </main>
  );
}
