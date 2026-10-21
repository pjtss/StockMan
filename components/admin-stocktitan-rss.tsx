"use client";

import { useEffect, useRef, useState } from "react";
import { Clipboard, Eye, RefreshCw } from "lucide-react";
import { AdminModal } from "@/components/admin-modal";
import { formatDisplayCurrency } from "@/lib/display-number";
import {
  MARKET_RSS_GRADE_LABELS,
  type MarketRssGrade,
} from "@/lib/market-rss-grade";
import {
  MARKET_RSS_SOURCES,
  type MarketRssSource,
} from "@/lib/market-rss-sources";
import styles from "./admin-stocktitan-rss.module.css";
import { copyToClipboard } from "@/lib/copy-to-clipboard";
import { areMarketRssTitlesEquivalent, getMarketRssTranslationDisplay } from "@/lib/market-rss-translation-label";
import { matchesMarketRssTranslationFilter, type MarketRssTranslationFilter } from "@/lib/market-rss-translation-filter";
import { formatMarketRssTranslationAttemptTime, getMarketRssTranslationAttemptLabel, getMarketRssTranslationRetryDisplay } from "@/lib/market-rss-retry-display";
import { MARKET_RSS_TRANSLATION_MAX_ATTEMPTS, MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS } from "@/lib/market-rss-translation-retry-constants";
import { buildMarketRssTranslationReviewCsv, getMarketRssTranslationReviewArticles } from "@/lib/market-rss-translation-review-export";
import { getMarketRssNotificationStatusDisplay } from "@/lib/market-rss-notification-status";
import { matchesMarketRssNotificationFilter, type MarketRssNotificationFilter } from "@/lib/market-rss-notification-filter";
import { getMarketRssDisplayTitle } from "@/lib/market-rss-display-title";
import { formatMarketRssPublishedAt } from "@/lib/market-rss-published-at";
import { getMarketRssTranslationReasonDisplay } from "@/lib/market-rss-translation-reason";

type GradeFilter = "all" | MarketRssGrade;

type Article = Record<string, unknown> & {
  id: number;
  source?: string;
  title: string;
  summary: string;
  rawPayload?: string | null;
  translatedTitle?: string | null;
  translationCandidateTitle?: string | null;
  detectedTicker?: string | null;
  eventDirection?: string;
  financingAmountUsd?: number | null;
  dilutionRisk?: string | null;
  link: string;
  publishedAt?: string | null;
  category: string;
  priority: number;
  notifyEligible: boolean;
  isBacklog: boolean;
  translationStatus: string;
  translationProvider?: string | null;
  translationCharCount?: number;
  translationFallback: boolean;
  translationError?: string | null;
  translationSkippedReason?: string | null;
  translationAttempts?: number;
  translationAttemptedAt?: string | null;
  updatedAt?: string | Date;
  notificationStatus: string;
  lastError?: string | null;
  grade: MarketRssGrade;
};

const SOURCE_LABELS: Record<MarketRssSource, string> = {
  GLOBENEWSWIRE: "GlobeNewswire",
  NASDAQ: "NASDAQ",
  NASDAQ_TRADER: "NASDAQ Trader",
  SEC_EDGAR: "SEC EDGAR",
  STOCKTITAN: "StockTitan",
};

const json = (value: unknown) => JSON.stringify(value, null, 2);
const marketRssQueryKey = (date: string, afterTime: string, source: string, grade: string) => `${date}\u0000${afterTime}\u0000${source}\u0000${grade}`;

function dateValue() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

export function AdminStockTitanRss() {
  const [date, setDate] = useState(dateValue());
  const [afterTime, setAfterTime] = useState("");
  const [source, setSource] = useState<MarketRssSource>("STOCKTITAN");
  const [grade, setGrade] = useState<GradeFilter>("all");
  const [translationFilter, setTranslationFilter] = useState<MarketRssTranslationFilter>("all");
  const [notificationFilter, setNotificationFilter] = useState<MarketRssNotificationFilter>("all");
  const [articles, setArticles] = useState<Article[]>([]);
  const [loadedQueryKey, setLoadedQueryKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Article | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [retryingArticleId, setRetryingArticleId] = useState<number | null>(null);
  const [retryMessage, setRetryMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const lastLoadedAtRef = useRef(0);
  const activeRequestKeyRef = useRef<string | null>(null);
  const latestRequestIdRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);

  async function load() {
    const requestKey = marketRssQueryKey(date, afterTime, source, grade);
    if (activeRequestKeyRef.current === requestKey) return;
    activeControllerRef.current?.abort();
    activeRequestKeyRef.current = requestKey;
    const requestId = ++latestRequestIdRef.current;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        date,
        source,
        grade,
      });
      if (afterTime) query.set("afterTime", afterTime);
      const response = await fetch(`/api/admin/stocktitan-rss?${query.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "조회 실패");
      const queryMetadataKeys = ["date", "source", "grade", "afterTime", "timezone"] as const;
      const isResponseObject = value !== null && typeof value === "object" && !Array.isArray(value);
      const hasQueryMetadata = isResponseObject && queryMetadataKeys.some((key) => key in value);
      const requiresQueryMetadata = hasQueryMetadata || Boolean(afterTime);
      const responseConditionsMismatch = !isResponseObject
        || (requiresQueryMetadata && queryMetadataKeys.some((key) => !(key in value)))
        || (requiresQueryMetadata && (value.date !== date
          || value.source !== source
          || value.grade !== grade
          || value.afterTime !== (afterTime || null)
          || value.timezone !== "Asia/Seoul"));
      if (responseConditionsMismatch) throw new Error("조회 응답 조건이 요청과 일치하지 않습니다. 다시 조회해 주세요.");
      if (requestId === latestRequestIdRef.current) {
        setArticles(value.articles || []);
        setLoadedQueryKey(requestKey);
        const loadedAt = Date.now();
        lastLoadedAtRef.current = loadedAt;
        setLastLoadedAt(new Date(loadedAt));
      }
    } catch (e) {
      if (requestId === latestRequestIdRef.current) {
        setError(e instanceof Error ? e.message : "조회 실패");
        setArticles([]);
      }
    } finally {
      if (activeRequestKeyRef.current === requestKey) activeRequestKeyRef.current = null;
      if (activeControllerRef.current === controller) activeControllerRef.current = null;
      if (requestId === latestRequestIdRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => () => {
    latestRequestIdRef.current++;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    activeRequestKeyRef.current = null;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshIfStale = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadedAtRef.current >= 30_000) void load();
    };
    window.addEventListener("focus", refreshIfStale);
    document.addEventListener("visibilitychange", refreshIfStale);
    return () => {
      window.removeEventListener("focus", refreshIfStale);
      document.removeEventListener("visibilitychange", refreshIfStale);
    };
  }, [date, afterTime, source, grade]);

  async function copy(label: string, value: unknown) {
    try {
      await copyToClipboard(typeof value === "string" ? value : json(value));
      setCopied(label);
      window.setTimeout(() => setCopied(""), 1400);
    } catch (copyError) {
      setError(copyError instanceof Error ? `복사 실패: ${copyError.message}` : "복사 실패");
    }
  }

  async function retryTranslation(article: Article) {
    if (!article.updatedAt) {
      setRetryMessage("기사 갱신 시각이 없어 안전하게 재시도할 수 없습니다. 목록을 새로고침하세요.");
      return;
    }
      if (!window.confirm("번역 API를 다시 호출할 수 있습니다. 설정·캐시·provider 오류 원인을 먼저 조치했나요? 이 기사를 번역 재시도 대기열에 등록할까요? 이 작업은 Discord 알림 상태를 바꾸거나 알림을 재발송하지 않습니다.")) return;
    setRetryingArticleId(article.id);
    setRetryMessage("");
    try {
      const response = await fetch("/api/admin/stocktitan-rss", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: article.id,
          expectedUpdatedAt: new Date(article.updatedAt).toISOString(),
          expectedTitle: article.title,
          expectedStatus: article.translationStatus,
          expectedReason: article.translationSkippedReason ?? null,
          expectedAttempts: Number(article.translationAttempts || 0),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) throw new Error("기사가 변경됐거나 재시도 대상이 아닙니다. 목록을 새로고침한 뒤 확인하세요.");
        throw new Error(result.error || "번역 재시도 등록에 실패했습니다.");
      }
      setRetryMessage(result.message || "번역 재시도 대기열에 등록했습니다. 기존 cron 번역 worker가 처리하며, Discord 알림은 재발송하지 않습니다.");
      setSelected({ ...article, translationStatus: "PENDING", translationFallback: false, translationAttempts: 0, translationAttemptedAt: null, translationSkippedReason: null, translationError: null, translationCandidateTitle: null, translatedTitle: null });
      setArticles((current) => current.map((item) => item.id === article.id ? { ...item, translationStatus: "PENDING", translationFallback: false, translationAttempts: 0, translationAttemptedAt: null, translationSkippedReason: null, translationError: null, translationCandidateTitle: null, translatedTitle: null } : item));
    } catch (retryError) {
      setRetryMessage(retryError instanceof Error ? retryError.message : "번역 재시도 등록에 실패했습니다.");
    } finally {
      setRetryingArticleId(null);
    }
  }

  function downloadTranslationReviewCsv() {
    const { count, content } = buildMarketRssTranslationReviewCsv(visibleArticles);
    if (!count) return;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = reviewFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const gradeLabel = (value: MarketRssGrade) => MARKET_RSS_GRADE_LABELS[value];
  const currentQueryKey = marketRssQueryKey(date, afterTime, source, grade);
  const queryConditionsChanged = loadedQueryKey !== null && loadedQueryKey !== currentQueryKey;
  const visibleArticles = articles.filter((article) =>
    matchesMarketRssTranslationFilter(article, translationFilter, now)
      && matchesMarketRssNotificationFilter(article, notificationFilter),
  );
  const reviewArticleCount = getMarketRssTranslationReviewArticles(visibleArticles).length;
  const activeFilters = [
    afterTime ? `after-${afterTime.replace(":", "")}` : "",
    grade !== "all" ? grade : "",
    translationFilter !== "all" ? translationFilter.toLowerCase() : "",
    notificationFilter !== "all" ? notificationFilter.toLowerCase() : "",
  ].filter(Boolean).join("-");
  const reviewFilename = `rss-translation-review-${source.toLowerCase()}-${date}${activeFilters ? `-${activeFilters}` : ""}.csv`;
  const reviewInput = `Join-Path $env:USERPROFILE "Downloads\\${reviewFilename}"`;
  const reviewPreviewCommand = `$reviewCsvPath = ${reviewInput}\nnode scripts/market-rss-translation-review-import.mjs --input $reviewCsvPath`;
  const reviewApplyCommand = `$reviewCsvPath = ${reviewInput}\nnode scripts/market-rss-translation-review-import.mjs --input $reviewCsvPath --apply`;
  const monthlyQuotaFallbacks = articles.filter((article) =>
    article.translationFallback && article.translationSkippedReason === "monthly_character_limit_reached",
  ).length;
  const providerDailyQuotaFallbacks = articles.filter((article) =>
    article.translationFallback && article.translationSkippedReason === "provider_daily_quota_exceeded",
  ).length;
  const exhaustedRetries = articles.filter((article) => {
    const retryableFallback = article.translationFallback
      && MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS.includes(article.translationSkippedReason as typeof MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS[number]);
    return (article.translationStatus === "FAILED" || retryableFallback) && Number(article.translationAttempts || 0) >= MARKET_RSS_TRANSLATION_MAX_ATTEMPTS;
  }).length;
  const retryReadyCount = articles.filter((article) => matchesMarketRssTranslationFilter(article, "RETRY_READY", now)).length;
  const providerRequestCount = articles.filter((article) => article.translationProvider === "google-cloud-translation" || article.translationProvider === "azure-translator").length;
  const azureRequestCount = articles.filter((article) => article.translationProvider === "azure-translator").length;
  const providerCharacterCount = articles.reduce((total, article) => total + Math.max(0, Number(article.translationCharCount) || 0), 0);
  const uncertainNotificationCount = articles.filter((article) => article.notificationStatus === "UNCERTAIN").length;

  return (
    <section className={styles.container}>
      <div className={styles.toolbar}>
        <div>
          <strong>RSS 공시 등급 조회</strong>
          <p>출처·한국시간 날짜·호재 등급으로 저장된 RSS 공시를 좁혀 보고, 기사별 원문과 처리 상태를 확인합니다.</p>
        </div>
        <div className={styles.actions}>
          <select value={source} onChange={(e) => setSource(e.target.value as MarketRssSource)} aria-label="RSS 출처">
            {MARKET_RSS_SOURCES.map((value) => <option key={value} value={value}>{SOURCE_LABELS[value]}</option>)}
          </select>
          <select value={grade} onChange={(e) => setGrade(e.target.value as GradeFilter)} aria-label="호재 등급">
            <option value="all">전체 등급</option>
            {(Object.keys(MARKET_RSS_GRADE_LABELS) as MarketRssGrade[]).map((value) => <option key={value} value={value}>{gradeLabel(value)}</option>)}
          </select>
          <select value={translationFilter} onChange={(e) => setTranslationFilter(e.target.value as MarketRssTranslationFilter)} aria-label="번역 상태">
            <option value="all">전체 번역 상태</option>
            <option value="PENDING">번역 대기</option>
            <option value="TRANSLATED">번역 완료</option>
            <option value="NOT_REQUIRED">번역 불필요</option>
            <option value="FALLBACK">원문 fallback</option>
            <option value="FAILED">번역 실패</option>
            <option value="RETRY_READY">재시도 가능</option>
            <option value="REVIEW">사람 검수 대상</option>
          </select>
          <select value={notificationFilter} onChange={(e) => setNotificationFilter(e.target.value as MarketRssNotificationFilter)} aria-label="알림 상태">
            <option value="all">전체 알림 상태</option>
            <option value="PENDING">알림 대기</option>
            <option value="PROCESSING">발송 준비 중</option>
            <option value="SENDING">Discord 전송 중</option>
            <option value="SENT">Discord 전송 완료</option>
            <option value="FAILED">알림 실패</option>
            <option value="SKIPPED">알림 제외</option>
            <option value="UNCERTAIN">전송 여부 확인 필요</option>
          </select>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="발행일 (KST)" />
          <label className={styles.timeFilter}>
            <span>발행 시각 이후 (KST)</span>
            <input type="time" value={afterTime} onChange={(e) => setAfterTime(e.target.value)} aria-label="발행 시각 이후 (KST)" />
          </label>
          <button onClick={downloadTranslationReviewCsv} disabled={loading || queryConditionsChanged || reviewArticleCount === 0} aria-label="번역 검수 CSV 다운로드">
            번역 검수 CSV {reviewArticleCount}건
          </button>
          {!loading && !error && !queryConditionsChanged && reviewArticleCount === 0 && (
            <span className={styles.reviewEmptyHint} role="status" aria-live="polite">
              현재 조건에서 검수할 번역이 없습니다. 조회 날짜·출처·필터를 넓혀 보세요.
            </span>
          )}
          <button onClick={() => void load()}>
            <RefreshCw size={15} className={loading ? styles.spin : undefined} /> {loading ? "다시 조회" : "조회"}
          </button>
        </div>
      </div>

      <details className={styles.reviewHelp}>
        <summary>검수 결과를 번역 회귀 사례로 반영하는 방법</summary>
        <p>각 행을 아래 기준으로 판정하세요. 티커·금액·퍼센트·분기는 원문과 정확히 보존하고, 제공된 요약이나 링크만으로 확인되지 않는 내용은 추측하지 마세요.</p>
        <ul>
          <li><strong>정확</strong>: 번역문이 의미와 수치를 보존하면 선택하고 수정 번역은 비워 둡니다.</li>
          <li><strong>자동검사 오탐 확인</strong>: 자동 품질검사 후보 표식이 있는 행을 원문과 대조해 실제 번역은 정확하지만 자동검사만 잘못 거부했다고 확인했을 때 선택합니다. 번역문을 수정하지 않고 사람 확인 사례로 기록합니다.</li>
          <li><strong>부분번역</strong>: 의미 일부가 빠졌으면 선택하고, 빠진 정보를 반영한 전체 수정 번역을 적습니다.</li>
          <li><strong>오역</strong>: 의미·방향·수치가 잘못됐으면 선택하고, 원문에 맞는 전체 수정 번역을 적습니다.</li>
          <li><strong>보류</strong>: 문맥이 부족하거나 판정이 불확실할 때 선택합니다. fixture에 반영되지 않습니다.</li>
        </ul>
        <p>검수 메모에 <code>RSS-REVIEW-CANDIDATE</code>가 있는 행은 일반 <strong>정확</strong> 판정 대신 <strong>자동검사 오탐 확인</strong>, 실제 오류라면 <strong>부분번역</strong>/<strong>오역</strong>을 선택하세요. 자동검사만 오탐이라고 확인하려면 원문과 요약 또는 원문 링크를 대조하고 수정 번역은 비워 둡니다. 근거가 부족하면 <strong>보류</strong>하고, importer 통과를 위해 사실과 다른 판정을 선택하지 마세요.</p>
        <p>작성 후 로컬 프로젝트 루트의 PowerShell에서 먼저 미리보기하고 결과를 확인한 경우에만 적용하세요. 운영 서버나 DB에는 쓰지 않습니다. 브라우저 다운로드 폴더를 변경했다면 아래 경로의 폴더 부분을 맞춰 주세요.</p>
        <div className={styles.reviewCommand}>
          <div className={styles.reviewCommandHead}><span>미리보기</span><button type="button" onClick={() => void copy("review-preview", reviewPreviewCommand)} aria-label="미리보기 명령 복사">{copied === "review-preview" ? "복사됨" : "명령 복사"}</button></div>
          <pre>{reviewPreviewCommand}</pre>
        </div>
        <div className={styles.reviewCommand}>
          <div className={styles.reviewCommandHead}><span>검수 결과 적용</span><button type="button" onClick={() => void copy("review-apply", reviewApplyCommand)} aria-label="적용 명령 복사">{copied === "review-apply" ? "복사됨" : "명령 복사"}</button></div>
          <pre>{reviewApplyCommand}</pre>
        </div>
      </details>

      {error && <p className={styles.error}>{error}</p>}

      {!queryConditionsChanged && <div className={styles.stats}>
        <span>{SOURCE_LABELS[source]}</span>
        <span>{date} KST{afterTime ? ` · ${afterTime} 이후` : " · 종일"}</span>
        <span role="status" aria-label="RSS 마지막 조회 시각">조회 {lastLoadedAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(lastLoadedAt) + " KST" : "대기 중"}</span>
        <span>{grade === "all" ? "전체 등급" : gradeLabel(grade)} </span>
        <span>기사 {articles.length}건</span>
        <span>현재 표시 {visibleArticles.length}건</span>
        <span>알림 대상 {articles.filter((article) => article.notifyEligible).length}건</span>
        <span role="status" aria-label="Discord 전송 미확정 건수">전송 미확정 {uncertainNotificationCount}건</span>
        <span>번역 fallback {articles.filter((article) => article.translationFallback).length}건</span>
        <span>번역 provider 요청 {providerRequestCount}건 (Azure {azureRequestCount}건) · 입력 {providerCharacterCount.toLocaleString()}자</span>
        <span>월간 한도 {monthlyQuotaFallbacks}건</span>
        <span>Google 일일 한도 {providerDailyQuotaFallbacks}건</span>
        <span>자동 재시도 종료 {exhaustedRetries}건</span>
        <span role="status" aria-label="지금 재시도 가능한 번역 건수">재시도 가능 {retryReadyCount}건</span>
      </div>}

      {queryConditionsChanged ? (
        <p className={styles.staleResults} role="status" aria-live="polite">
          {loading ? "선택한 조건으로 RSS 조회 중입니다." : "조회 조건이 변경되어 이전 결과를 숨겼습니다. 최신 결과를 보려면 조회를 눌러 주세요."}
        </p>
      ) : articles.length === 0 ? (
        <p className={styles.empty}>선택한 출처·날짜·시각·등급에 해당하는 RSS 공시가 없습니다.</p>
      ) : visibleArticles.length === 0 ? (
        <p className={styles.empty}>선택한 번역·알림 상태에 해당하는 RSS 공시가 없습니다.</p>
      ) : (
        <div className={styles.list}>
          {visibleArticles.map((article) => (
            <article className={styles.card} key={article.id}>
              <div className={styles.cardTop}>
                <span className={styles.badge}>{gradeLabel(article.grade)} · {article.category} · P{article.priority}</span>
                <span className={article.notifyEligible ? styles.eligible : styles.muted}>
                  {article.notifyEligible ? "알림 대상" : "알림 제외"}
                </span>
              </div>
              <h2>{getMarketRssDisplayTitle(article)}</h2>
              {!article.translationFallback && article.translatedTitle && !areMarketRssTitlesEquivalent(article.translatedTitle, article.title) && <p className={styles.original}>{article.title}</p>}
              <div className={styles.meta}>
                <time dateTime={article.publishedAt || undefined}>{formatMarketRssPublishedAt(article.publishedAt)}</time>
                <span>{article.detectedTicker ? `티커 ${article.detectedTicker}` : "티커 미추출"}</span>
                <span>{article.eventDirection || "NEUTRAL"}{article.financingAmountUsd ? ` · ${formatDisplayCurrency(article.financingAmountUsd)}` : ""}</span>
                <span className={styles[getMarketRssTranslationDisplay(article).tone]} title={article.translationError || undefined}>
                  {getMarketRssTranslationDisplay(article).label}
                </span>
                <span className={styles[getMarketRssNotificationStatusDisplay(article.notificationStatus).tone]} title={article.lastError || undefined}>
                  {getMarketRssNotificationStatusDisplay(article.notificationStatus).label}
                </span>
              </div>
              {getMarketRssNotificationStatusDisplay(article.notificationStatus).description && (
                <p className={styles.retryInfo}>{getMarketRssNotificationStatusDisplay(article.notificationStatus).description}</p>
              )}
              {getMarketRssTranslationRetryDisplay(article, now) && (
                <p className={styles.retryInfo}>{getMarketRssTranslationRetryDisplay(article, now)}</p>
              )}
              <button className={styles.detail} onClick={() => { setRetryMessage(""); setSelected(article); }}>
                <Eye size={15} /> 전체 디버깅 보기
              </button>
            </article>
          ))}
        </div>
      )}

      {selected && (
        <AdminModal
          title={`${selected.source || SOURCE_LABELS[source]} · ${selected.title}`}
          description={`호재 등급: ${gradeLabel(selected.grade)} · priority ${selected.priority} · 알림 대상 ${selected.notifyEligible ? "예" : "아니오"}. 원문, 번역본, RSS 원시 항목, 필터 판정, 알림 상태와 JSON 전체를 확인합니다.`}
          onClose={() => { setRetryMessage(""); setSelected(null); }}
          wide
        >
          <div className={styles.detailGrid}>
            <section>
              <h3>원문 제목</h3>
              <pre>{selected.title}</pre>
              <button onClick={() => void copy("title", selected.title)}><Clipboard size={14} /> {copied === "title" ? "복사됨" : "제목 복사"}</button>
              <h3>원문 요약</h3>
              <pre>{selected.summary || "(없음)"}</pre>
              <button onClick={() => void copy("summary", selected.summary)}><Clipboard size={14} /> {copied === "summary" ? "복사됨" : "요약 복사"}</button>
              <h3>RSS 원시 항목</h3>
              <pre>{selected.rawPayload || "(저장된 원시 항목 없음)"}</pre>
              <button onClick={() => void copy("raw", selected.rawPayload || "")}><Clipboard size={14} /> {copied === "raw" ? "복사됨" : "원시 항목 복사"}</button>
            </section>
            <section>
              <h3>번역 제목</h3>
              <pre>{selected.translationFallback ? "(번역 결과 미사용 · 원문을 표시 중)" : selected.translatedTitle || "(번역 없음)"}</pre>
              {selected.translationCandidateTitle && (selected.translationSkippedReason === "translation_output_incomplete" || selected.translationSkippedReason === "target_language_not_detected" || selected.translationSkippedReason === "translation_numeric_hallucination" || selected.translationSkippedReason === "translation_cache_invalidation_failed") && (
                <>
                  <h3>검수할 후보 번역</h3>
                  <pre>{selected.translationCandidateTitle}</pre>
                  <p className={styles.translationWarning}>{selected.translationSkippedReason === "translation_output_incomplete"
                    ? "자동 길이 검사에서 부분 번역 의심으로 제외한 후보입니다. 원문 요약·링크와 대조해 오탐 여부를 확인하세요."
                    : selected.translationSkippedReason === "target_language_not_detected"
                      ? "한국어 비율 검사에서 제외한 provider 후보입니다. 원문 요약·링크와 대조해 오탐 여부를 확인하세요."
                      : selected.translationSkippedReason === "translation_numeric_hallucination"
                        ? "원문에 없는 숫자나 부호가 감지되어 제외한 provider 후보입니다. 원문 숫자·상승/하락 방향과 요약·링크를 대조하세요."
                        : "검증에 실패한 캐시 번역을 삭제하지 못해 후보가 남아 있습니다. 후보를 신뢰하지 말고 원문·요약과 대조하세요. 캐시 저장소 복구 후 자동 재시도됩니다."}</p>
                  <button onClick={() => void copy("candidate", selected.translationCandidateTitle || "")}><Clipboard size={14} /> {copied === "candidate" ? "복사됨" : "후보 번역 복사"}</button>
                </>
              )}
              {areMarketRssTitlesEquivalent(selected.translatedTitle, selected.title) && selected.translationSkippedReason !== "already_in_target_language" && (
                <p className={styles.translationWarning}>원문과 번역문이 같습니다 · 고유명사 위주일 수 있으니 의미를 확인하세요</p>
              )}
              {!selected.translatedTitle && !selected.translationFallback && (
                <p className={styles.translationWarning}>번역 결과가 아직 없습니다</p>
              )}
              <p className={styles[getMarketRssTranslationDisplay(selected).tone]}>
                {getMarketRssTranslationDisplay(selected).label}
              </p>
              {selected.translationFallback && (
                <p className={styles.retryInfo}>
                  {getMarketRssTranslationReasonDisplay(selected.translationSkippedReason).operatorAction}
                  {Number(selected.translationAttempts || 0) >= MARKET_RSS_TRANSLATION_MAX_ATTEMPTS
                    && (selected.translationStatus === "FAILED" || MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS.includes(selected.translationSkippedReason as typeof MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS[number]))
                    ? " 자동 재시도는 종료됐습니다. 원인을 조치한 뒤 수동 재시도 기능을 사용하세요."
                    : ""}
                </p>
              )}
              <p className={styles.retryInfo}>
                {selected.translationProvider === "google-cloud-translation"
                  ? `Google 번역 요청 · 입력 ${Math.max(0, Number(selected.translationCharCount) || 0).toLocaleString()}자`
                  : selected.translationProvider === "azure-translator"
                    ? `Azure Translator 요청 · 입력 ${Math.max(0, Number(selected.translationCharCount) || 0).toLocaleString()}자`
                    : "번역 provider API 호출 없음 · 내부 상태 처리 또는 아직 호출 전"}
              </p>
              {(selected.translationAttemptedAt || Number(selected.translationAttempts) > 0 || selected.translationStatus === "FAILED" || selected.translationFallback) && (
                <p className={styles.retryInfo}>
                  {getMarketRssTranslationAttemptLabel(selected)} {selected.translationAttemptedAt ? formatMarketRssTranslationAttemptTime(selected.translationAttemptedAt) || "시각 데이터 확인 필요" : "시도 시각 없음"} KST
                  {selected.translationSkippedReason === "monthly_character_limit_reached"
                    ? ` · 한도 확인 ${selected.translationAttempts || 0}회`
                    : selected.translationSkippedReason === "provider_daily_quota_exceeded"
                      ? ` · Google 일일 한도 확인 ${selected.translationAttempts || 0}회`
                    : ` · ${selected.translationAttempts || 0}/${MARKET_RSS_TRANSLATION_MAX_ATTEMPTS}회`}
                </p>
              )}
              {getMarketRssTranslationRetryDisplay(selected, now) && (
                <p className={styles.retryInfo}>{getMarketRssTranslationRetryDisplay(selected, now)}</p>
              )}
              {selected.translationFallback
                && Number(selected.translationAttempts || 0) >= MARKET_RSS_TRANSLATION_MAX_ATTEMPTS
                && (selected.translationStatus === "FAILED"
                  || selected.translationSkippedReason === "cloud_translation_not_configured"
                  || MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS.includes(selected.translationSkippedReason as typeof MARKET_RSS_TRANSLATION_RETRYABLE_SKIPPED_REASONS[number])) && (
                <>
                  <button type="button" disabled={retryingArticleId === selected.id} onClick={() => void retryTranslation(selected)}>
                    <RefreshCw size={14} /> {retryingArticleId === selected.id ? "재시도 등록 중…" : "번역 수동 재시도"}
                  </button>
                </>
              )}
              {retryMessage && <p role="status" className={styles.retryInfo}>{retryMessage}</p>}
              <button onClick={() => void copy("translated", selected.translationFallback ? selected.title : selected.translatedTitle || "")}><Clipboard size={14} /> {copied === "translated" ? "복사됨" : selected.translationFallback ? "사용 중인 원문 제목 복사" : "번역 제목 복사"}</button>
              <button onClick={() => void copy("comparison", `원문: ${selected.title}\n번역: ${selected.translationFallback ? "(미사용 · 원문 fallback)" : selected.translatedTitle || "(번역 없음)"}`)}><Clipboard size={14} /> {copied === "comparison" ? "복사됨" : "원문·번역 비교 복사"}</button>
              <h3>원문 요약 · 미번역</h3>
              <pre>{selected.summary || "(원문 요약 없음)"}</pre>
              <button onClick={() => void copy("originalSummary", selected.summary || "")}><Clipboard size={14} /> {copied === "originalSummary" ? "복사됨" : "원문 요약 복사"}</button>
              <h3>링크</h3>
              <pre>{selected.link || "(없음)"}</pre>
            </section>
          </div>
          <div className={styles.debugHeader}>
            <h3>처리 결과 JSON</h3>
            <button onClick={() => void copy("json", selected)}><Clipboard size={14} /> {copied === "json" ? "복사됨" : "전체 JSON 복사"}</button>
          </div>
          <pre className={styles.raw}>{json(selected)}</pre>
        </AdminModal>
      )}
    </section>
  );
}
