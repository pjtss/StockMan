"use client";
import { useEffect, useRef, useState } from "react";
import { getSeoulDateKey } from "@/lib/seoul-date";
type Item = Record<string, unknown> & { id: number; source: string; link?: string };
type WindowInfo = { hours: number; from: string; to: string } | null;
type QueryWindowInfo = { kind: "KST_CALENDAR_DAY" | "ROLLING_HOURS"; from: string; to: string; endExclusive: true } | null;
type QueryPaginationInfo = { page: number | null; pageSize: number | null; hasMore: boolean };
type SourceCoverageInfo = { source: string; sourceClass: "OFFICIAL_DISCLOSURE" | "EXCHANGE_FEED" | "THIRD_PARTY_RSS"; configuredState: "ENABLED" | "DISABLED" | "UNKNOWN"; latestAttempt: { fetchState: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED" | "UNKNOWN"; persistState: "SUCCESS" | "PARTIAL" | "FAILED" | "NOT_RUN" | "UNKNOWN"; fetchedAt: string | null; observedAt: string | null; itemCount: number | null; pageCount: number | null; failureCode: string | null } | null; lastSuccessfulPersistAt: string | null; rangeCoverage: "ENUMERATED_PROVIDER_RESPONSE" | "PARTIAL" | "UNKNOWN" };
const DISCLOSURE_PAGE_SIZE = 100;
const US_RSS_DISCLOSURE_SOURCES = ["SEC_EDGAR", "NASDAQ", "NASDAQ_TRADER", "STOCKTITAN", "GLOBENEWSWIRE"] as const;
const SOURCES = [
  { value: "DART", label: "DART 공시" },
  { value: "SEC", label: "SEC 제출목록" },
  { value: "KRX_KIND", label: "KIND 거래소 공시 RSS" },
  { value: "NEWSIS", label: "뉴시스 RSS" },
  { value: "MK", label: "매일경제 RSS" },
  { value: "HANKYUNG", label: "한국경제 RSS" },
  { value: "ETODAY", label: "이투데이 RSS" },
  { value: "SEC_EDGAR", label: "SEC EDGAR RSS" },
  { value: "STOCKTITAN", label: "StockTitan RSS" },
  { value: "NASDAQ", label: "Nasdaq RSS" },
  { value: "NASDAQ_TRADER", label: "Nasdaq Trader RSS" },
  { value: "GLOBENEWSWIRE", label: "GlobeNewswire RSS" },
];
const COVERAGE_LABELS: Record<string, string> = { SUCCESS: "성공", PARTIAL: "부분", FAILED: "실패", SKIPPED: "건너뜀", NOT_RUN: "미실행", UNKNOWN: "미확인", ENABLED: "활성", DISABLED: "비활성" };
const RANGE_COVERAGE_LABELS: Record<SourceCoverageInfo["rangeCoverage"], string> = { ENUMERATED_PROVIDER_RESPONSE: "provider 응답 열거", PARTIAL: "부분 확인", UNKNOWN: "미확인" };
const CONTENT_STATUS_LABELS: Record<string, string> = { FULL: "본문", EXCERPT: "본문 발췌", METADATA_ONLY: "목록 정보", UNAVAILABLE: "원문 확인 불가" };

function stringValue(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }

function safeHttpUrl(value: unknown) {
  const url = stringValue(value);
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === "https:" || parsed.protocol === "http:") && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
}

function disclosureLink(item: Item) { return safeHttpUrl(item.link) ?? safeHttpUrl(item.url); }

function disclosureSourceLabel(source: string) { return SOURCES.find((entry) => entry.value === source)?.label ?? source; }

function disclosureTimeLabel(item: Item, timeZone: string) {
  const sortBasis = stringValue(item.sortBasis);
  const publishedAt = stringValue(item.publishedAt);
  if (sortBasis === "PUBLISHED_INSTANT" && publishedAt) {
    const date = new Date(publishedAt);
    if (!Number.isNaN(date.getTime())) return `발표 ${date.toLocaleString("ko-KR", { timeZone })}`;
  }
  const filedAt = stringValue(item.filedAt);
  if (filedAt && item.filedAtPrecision === "DATE") return item.source === "DART" || item.source === "SEC" ? `접수일 ${filedAt}` : `날짜만 확인 ${filedAt}`;
  return "발행·접수 시각 미확인";
}

function DisclosureItemCard({ item, timeZone }: { item: Item; timeZone: string }) {
  const source = stringValue(item.source) ?? "UNKNOWN";
  const sourceLabel = disclosureSourceLabel(source);
  const title = stringValue(item.title) ?? "제목 미제공";
  const summary = stringValue(item.summary);
  const content = stringValue(item.content);
  const excerpt = (summary ?? content)?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 520) ?? null;
  const contentStatus = stringValue(item.contentStatus) ?? "UNKNOWN";
  const companyNames = Array.isArray(item.companyNames) ? item.companyNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const tickers = Array.isArray(item.tickers) ? item.tickers.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  const link = disclosureLink(item);

  return <article className="disclosureItem" role="listitem">
    <div className="disclosureItemTop"><span className="disclosureItemSource">{sourceLabel}</span><span className="disclosureItemTime">{disclosureTimeLabel(item, timeZone)}</span><span className="disclosureItemStatus">{CONTENT_STATUS_LABELS[contentStatus] ?? "본문 상태 미확인"}</span></div>
    <h3 className="disclosureItemTitle">{link ? <a href={link} target="_blank" rel="noreferrer">{title}</a> : title}</h3>
    {(companyNames.length > 0 || tickers.length > 0) && <div className="disclosureItemEntities">{companyNames.map((name) => <span key={`company:${name}`}>{name}</span>)}{tickers.map((ticker) => <span key={`ticker:${ticker}`} className="disclosureItemTicker">{ticker}</span>)}</div>}
    {excerpt && <p className="disclosureItemExcerpt">{excerpt}{(summary ?? content ?? "").length > 520 ? "…" : ""}</p>}
    {link && <a className="disclosureItemLink" href={link} target="_blank" rel="noreferrer">원문 열기 <span aria-hidden="true">↗</span></a>}
  </article>;
}

export function DailyDisclosuresPage() {
  const [date, setDate] = useState(getSeoulDateKey());
  const [rangeMode, setRangeMode] = useState<"hours" | "date">("hours");
  const [hours, setHours] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [source, setSource] = useState("all"); const [items, setItems] = useState<Item[]>([]); const [windowInfo, setWindowInfo] = useState<WindowInfo>(null); const [queryWindowInfo, setQueryWindowInfo] = useState<QueryWindowInfo>(null); const [displayTimezone, setDisplayTimezone] = useState("Asia/Seoul"); const [sourceCoverage, setSourceCoverage] = useState<SourceCoverageInfo[]>([]); const [status, setStatus] = useState("");
  const [queryStatus, setQueryStatus] = useState<"DB_QUERY_COMPLETE" | "NO_MATCHING_STORED_ROWS">("NO_MATCHING_STORED_ROWS");
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState<QueryPaginationInfo>({ page: null, pageSize: null, hasMore: false });
  const [page, setPage] = useState(1);
  const rollingAsOf = useRef<string | null>(null);
  const [queryLoaded, setQueryLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setItems([]);
    setWindowInfo(null);
    setQueryWindowInfo(null);
    setSourceCoverage([]);
    setQueryStatus("NO_MATCHING_STORED_ROWS");
    setTotal(0);
    setPagination({ page: null, pageSize: null, hasMore: false });
    setQueryLoaded(false);
    setStatus("불러오는 중…");
    void (async () => {
      const params = new URLSearchParams({ source, page: String(page), pageSize: String(DISCLOSURE_PAGE_SIZE), ...(searchQuery ? { q: searchQuery } : {}), ...(rangeMode === "hours" ? { hours: String(hours), ...(rollingAsOf.current ? { asOf: rollingAsOf.current } : {}) } : { date }) });
      const response = await fetch(`/api/disclosures?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.json();
      if (!Array.isArray(body.items) || body.displayTimezone !== "Asia/Seoul" || !body.queryWindow || body.queryWindow.endExclusive !== true || !["DB_QUERY_COMPLETE", "NO_MATCHING_STORED_ROWS"].includes(body.queryStatus) || !Array.isArray(body.sourceCoverage) || (body.page != null && typeof body.page !== "number") || (body.pageSize != null && typeof body.pageSize !== "number") || (body.hasMore != null && typeof body.hasMore !== "boolean")) throw new Error("Invalid disclosure response");
      if (!cancelled) { const resolvedTotal = Number.isSafeInteger(body.total) && body.total >= 0 ? body.total : body.items.length; const resolvedPagination = { page: typeof body.page === "number" ? body.page : page, pageSize: typeof body.pageSize === "number" ? body.pageSize : DISCLOSURE_PAGE_SIZE, hasMore: body.hasMore === true }; if (rangeMode === "hours" && !rollingAsOf.current && body.queryWindow.kind === "ROLLING_HOURS") rollingAsOf.current = body.queryWindow.to; setItems(body.items as Item[]); setWindowInfo(body.window ?? null); setQueryWindowInfo(body.queryWindow); setDisplayTimezone(body.displayTimezone); setSourceCoverage(body.sourceCoverage as SourceCoverageInfo[]); setQueryStatus(body.queryStatus); setTotal(resolvedTotal); setPagination(resolvedPagination); setQueryLoaded(true); setStatus(body.queryStatus === "NO_MATCHING_STORED_ROWS" ? (searchQuery ? "검색 조건에 맞는 저장 항목이 없습니다." : "저장된 데이터가 없습니다. 원천 공시가 없다는 뜻은 아닙니다.") : `${resolvedTotal.toLocaleString()}건 ${searchQuery ? "검색 결과" : "저장 데이터 조회 완료"}`); }
    })().catch(() => { if (!cancelled) setStatus("조회에 실패했습니다."); });
    return () => { cancelled = true; };
  }, [date, hours, rangeMode, source]);
  const rangeMetadata = rangeMode === "hours" ? { hours, window: windowInfo } : { date };
  async function copyJson() { const value = items.map((item) => item.link).filter((link): link is string => typeof link === "string" && link.length > 0).join("\n"); let result = "failed"; try { if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value); else throw new Error("clipboard unavailable"); setStatus("원문 링크만 복사했습니다."); result = "success"; } catch { const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select(); const copied = document.execCommand("copy"); setStatus(copied ? "원문 링크만 복사했습니다." : "복사에 실패했습니다."); result = copied ? "success" : "failed"; area.remove(); } void fetch("/api/user-activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "news", action: "copy_json", resource: `${rangeMode === "hours" ? `${hours}h` : date}:${source}`, result }) }).catch(() => undefined); window.setTimeout(() => setStatus(""), 2000); }
  async function copyUsRssJson() {
    const usRssItems = items.filter((item) => US_RSS_DISCLOSURE_SOURCES.includes(item.source as typeof US_RSS_DISCLOSURE_SOURCES[number]));
    const value = usRssItems.map((item) => item.link).filter((link): link is string => typeof link === "string" && link.length > 0).join("\n");
    let result: "success" | "failed" = "success";
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setStatus(`미국 RSS 원문 링크 ${value ? value.split("\n").length.toLocaleString() : "0"}건을 복사했습니다.`);
    } catch {
      const area = document.createElement("textarea"); area.value = value; area.style.position = "fixed"; area.style.opacity = "0"; document.body.appendChild(area); area.select();
      const copied = document.execCommand("copy"); area.remove(); result = copied ? "success" : "failed";
      setStatus(copied ? `미국 RSS 원문 링크 ${value ? value.split("\n").length.toLocaleString() : "0"}건을 복사했습니다.` : "복사에 실패했습니다.");
    }
    void fetch("/api/user-activity", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ feature: "news", action: "copy_json", resource: `${rangeMode === "hours" ? `${hours}h` : date}:US_RSS`, result }) }).catch(() => undefined);
    window.setTimeout(() => setStatus(""), 2000);
  }
  function downloadJson() { const value = JSON.stringify({ ...rangeMetadata, source, total: items.length, items }, null, 2); const blobUrl = URL.createObjectURL(new Blob([value], { type: "application/json;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = blobUrl; anchor.download = `disclosures-${rangeMode === "hours" ? `last-${hours}-hours` : date}-${source.toLowerCase()}.json`; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000); }
  return <section className="disclosureBoard disclosureSurface"><div className="disclosureBoardHead"><div className="disclosureTitle"><span className="disclosureEyebrow">RAW DATA EXPORT</span><h2>JSON 내보내기</h2><p>{items.length.toLocaleString()}건 · 선택 조건의 전체 원본 데이터</p></div><div className="disclosureControls disclosureControlsModern"><label><span>조회 기준</span><select aria-label="조회 기준" value={rangeMode} onChange={(e) => setRangeMode(e.target.value as "hours" | "date")}><option value="hours">최근 시간</option><option value="date">기준일</option></select></label>{rangeMode === "hours" ? <label><span>기간</span><select aria-label="최근 시간" value={hours} onChange={(e) => setHours(Number(e.target.value))}>{Array.from({ length: 24 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>최근 {value}시간</option>)}</select></label> : <label><span>기준일</span><input aria-label="기준일" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}<label><span>출처</span><select aria-label="출처" value={source} onChange={(e) => setSource(e.target.value)}><option value="all">전체 출처</option>{SOURCES.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}</select></label><button type="button" className="disclosureCopyButton" onClick={() => void copyJson()} disabled={Boolean(status.includes("불러오는 중"))}>전체 링크 복사</button><button type="button" className="disclosureCopyButton" onClick={() => void copyUsRssJson()} disabled={Boolean(status.includes("불러오는 중"))}>미국 RSS 링크 복사</button><button type="button" className="disclosureCopyButton" onClick={downloadJson} disabled={!items.length || Boolean(status.includes("불러오는 중"))}>JSON 파일 저장</button></div></div>{status && <p role="status" className="disclosureStatus">{status}</p>}<div className="disclosureJsonHint">{rangeMode === "hours" ? <>현재 시각 기준 최근 {hours}시간의 저장 데이터입니다. 1~24시간 단위로 선택할 수 있습니다.{windowInfo && <> 조회 구간: {new Date(windowInfo.from).toLocaleString()} ~ {new Date(windowInfo.to).toLocaleString()}</>}</> : "선택한 날짜(KST)의 저장 데이터를 조회합니다."} 결과는 전체 복사 또는 JSON 파일로 저장할 수 있습니다.</div></section>;
}
