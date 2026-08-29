"use client";

import { useEffect, useState } from "react";
import { GLOBAL_POLLING_INTERVAL, PAGE_SIZE } from "@/lib/constants";
import { formatTime, getJudgmentStatus, paginateItems, sortByPublishedAtDesc } from "@/lib/utils";
import type { DartItem, DartJudgment, SecItem, SecSentiment } from "@/lib/types";
import { PageNavigation } from "./page-navigation";
import { getWatchlist, toggleWatchlist } from "@/lib/watchlist";
import { CompanyTimeline } from "./company-timeline";
import { ContractBadge } from "./contract-badge";
import styles from "./feed-page.module.css";
import { useFeedData } from "./use-feed-data";

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

function DartSections({ items, watchlist, onToggleWatchlist, onShowTimeline }: { items: DartItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void; onShowTimeline: (company: string) => void }) {
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
            <DartTable items={sectionItems} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} onShowTimeline={onShowTimeline} />
          </section>
        );
      })}
    </div>
  );
}

function DartTable({ items, watchlist, onToggleWatchlist, onShowTimeline }: { items: DartItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void; onShowTimeline: (company: string) => void }) {
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
                  <span 
                    className={styles.companyLink} 
                    onClick={() => onShowTimeline(item.company)}
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {item.company}
                  </span>
                  {isWatched && <span className={styles.watchlistBadge}>관심</span>}
                </td>
                <td>
                  <a href={item.link} target="_blank" rel="noreferrer">
                    {item.title}
                  </a>
                  {item.title.includes("단일판매ㆍ공급계약체결") && (
                    <ContractBadge rceptNo={item.rceptNo} />
                  )}
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

function SecSections({ items, watchlist, onToggleWatchlist, onShowTimeline }: { items: SecItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void; onShowTimeline: (company: string) => void }) {
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
            <SecTable items={sectionItems} watchlist={watchlist} onToggleWatchlist={onToggleWatchlist} onShowTimeline={onShowTimeline} />
          </section>
        );
      })}
    </div>
  );
}

function SecTable({ items, watchlist, onToggleWatchlist, onShowTimeline }: { items: SecItem[]; watchlist: string[]; onToggleWatchlist: (company: string) => void; onShowTimeline: (company: string) => void }) {
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
                  <span 
                    className={styles.companyLink} 
                    onClick={() => onShowTimeline(item.company)}
                    style={{ cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {item.company}
                  </span>
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
  const { loading, error, dartData, secData } = useFeedData(props.type);
  const [viewMode, setViewMode] = useState<ViewMode>("latest");
  const [page, setPage] = useState(1);
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  useEffect(() => {
    setWatchlist(getWatchlist());
  }, []);

  const handleToggleWatchlist = (company: string) => {
    setWatchlist(toggleWatchlist(company));
  };

  useEffect(() => {
    setPage(1);
  }, [props.type, viewMode]);

  const rawDartItems = dartData?.items ?? [];
  const rawSecItems = secData?.items ?? [];
  const currentPage = page;

  const count = props.type === "dart" ? rawDartItems.length : rawSecItems.length;
  const totalPages = Math.ceil(count / PAGE_SIZE);
  const fetchedAt = props.type === "dart" ? dartData?.fetchedAt : secData?.fetchedAt;

  const dartItems = paginateItems(rawDartItems, currentPage, PAGE_SIZE);
  const secItems = paginateItems(rawSecItems, currentPage, PAGE_SIZE);

  return (
    <main className={styles.page}>
      <PageNavigation current={props.type} />

      <section className={styles.hero}>
        <div>
          <p className={styles.kicker}>{props.type === "dart" ? "KOREA DISCLOSURES" : "U.S. FILINGS"}</p>
          <div className={styles.heroMain}>
          <p className={styles.heroDescription}>{props.description}</p>
          <h1 className={styles.heroTitle}>{props.title}</h1>
          </div>
        </div>
        <div className={styles.statusCard}>
          <strong>{loading ? "불러오는 중" : "실행 중"}</strong>
          <span>새로고침 주기 {GLOBAL_POLLING_INTERVAL / 1000}초</span>
          <span>표시 건수 {count}건</span>
          <span>페이지 {currentPage} / {totalPages}</span>
          <span>갱신 시각 {fetchedAt ? formatTime(fetchedAt) : "-"}</span>
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
          viewMode === "grouped" ? (
            <DartSections
              items={rawDartItems}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onShowTimeline={setSelectedCompany}
            />
          ) : (
            <DartTable
              items={dartItems}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onShowTimeline={setSelectedCompany}
            />
          )
        ) : (
          viewMode === "grouped" ? (
            <SecSections
              items={rawSecItems}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onShowTimeline={setSelectedCompany}
            />
          ) : (
            <SecTable
              items={secItems}
              watchlist={watchlist}
              onToggleWatchlist={handleToggleWatchlist}
              onShowTimeline={setSelectedCompany}
            />
          )
        )}
        
        {selectedCompany && (
          <CompanyTimeline
            company={selectedCompany}
            items={props.type === "dart" ? rawDartItems : rawSecItems}
            onClose={() => setSelectedCompany(null)}
          />
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
