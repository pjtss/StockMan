import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readLocalEnvFile } from "./local-env.mjs";

const BATCH_SIZE = 8;
const DECISIONS = ["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE", "INSUFFICIENT"];

function kstDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error("날짜는 YYYY-MM-DD 형식이어야 합니다.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (parsed.toISOString().slice(0, 10) !== value) throw new Error("존재하지 않는 날짜입니다.");
  return value;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function validateApiBaseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("RSS_BULLISH_REPORT_API_BASE_URL은 유효한 HTTPS origin이어야 합니다."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("RSS_BULLISH_REPORT_API_BASE_URL에는 자격증명 없이 HTTPS origin만 설정하세요.");
  }
  return url.origin;
}

function validateArticle(article) {
  return article && article.sourceType === "RSS"
    && typeof article.source === "string" && typeof article.externalId === "string"
    && typeof article.title === "string" && article.title.trim()
    && (article.content == null || typeof article.content === "string")
    && (article.summary == null || typeof article.summary === "string");
}

function isClearTickerSymbol(value) {
  return typeof value === "string" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(value.trim());
}

export function filterReportToPositiveKnownTickers(html) {
  let included = 0;
  const filtered = html.replace(/<article class="item ([^"]+)">[\s\S]*?<\/article>/g, (card, classes) => {
    const ticker = card.match(/<span class="ticker">([^<]*)<\/span>/)?.[1]?.trim();
    if (classes.split(/\s+/).includes("positive") && isClearTickerSymbol(ticker)) {
      included += 1;
      return card;
    }
    return "";
  });
  const lead = filtered.match(/<p class="lead">기준일 ([^<]+?) · ([^<]+?) · 분석 RSS (\d+)\/(\d+)건 · 생성 ([^<]+)<\/p>/);
  const analyzedCount = Number(lead?.[3] || 0);
  const totalCount = Number(lead?.[4] || 0);
  const generatedAt = lead?.[5] || "";
  const updatedLead = filtered.replace(/<p class="lead">[\s\S]*?<\/p>/, lead
    ? `<p class="lead">기준일 ${lead[1]} · ${lead[2]} · RSS ${analyzedCount}건 분석 · 호재 ${included}건만 수록 (티커 확인) · 생성 ${generatedAt}</p>`
    : `<p class="lead">호재 ${included}건만 수록 (티커 확인)</p>`);
  const statsStart = updatedLead.indexOf('<div class="stats">');
  const statsEnd = updatedLead.indexOf("</div></div>", statsStart);
  const withStats = statsStart >= 0 && statsEnd >= 0
    ? updatedLead.slice(0, statsStart) + `<div class="stats"><div class="stat"><b>${included}</b><span>호재 보고서 수록</span></div><div class="stat"><b>${analyzedCount}</b><span>분석 대상 RSS</span></div></div>` + updatedLead.slice(statsEnd + "</div></div>".length)
    : updatedLead;
  const sourceCounts = new Map();
  for (const card of withStats.match(/<article class="item [^"]+">[\s\S]*?<\/article>/g) || []) {
    const source = card.match(/<div class="meta">([^·<]+)/)?.[1]?.trim();
    if (source) sourceCounts.set(source, (sourceCounts.get(source) || 0) + 1);
  }
  const sourceSummary = [...sourceCounts].map(([source, count]) => `${escapeHtml(source)} ${count}건`).join(" · ") || "없음";
  let result = withStats.replace(/<p>출처별:[\s\S]*?<\/p>/, `<p>수록 호재 출처별: ${sourceSummary}</p>`);
  result = result.replace("각 항목을 LLM이 직접 한국어로 분석했습니다. 코드 키워드 분류기와 번역 전용 서비스를 사용하지 않았습니다.", "RSS 분석 결과 중 긍정 호재와 명확한 티커가 모두 확인된 항목만 이 보고서에 수록합니다.");
  if (!included) result = result.replace(/<section class="panel empty">[\s\S]*?<\/section>/, '<section class="panel empty">명확한 티커가 확인된 긍정 호재가 없습니다.</section>');
  return result.replace("LLM 직접 분석 · 운영 API는 조회 전용으로 사용", "LLM 직접 분석 · 긍정 호재와 확인된 티커만 표시 · 운영 API는 조회 전용으로 사용");
}

function validateAnalysisBatch(value, expectedIndexes) {
  if (!value || !Array.isArray(value.results) || value.results.length !== expectedIndexes.length) {
    throw new Error(`LLM 응답의 결과 개수가 입력 RSS 항목과 일치하지 않습니다 (요청 ${expectedIndexes.length}, 응답 ${Array.isArray(value?.results) ? value.results.length : "배열 없음"}).`);
  }
  const byIndex = new Map(value.results.map((result) => [result?.itemIndex, result]));
  if (byIndex.size !== expectedIndexes.length || expectedIndexes.some((index) => !byIndex.has(index))) {
    throw new Error("LLM 응답의 itemIndex가 입력 RSS 항목과 일치하지 않습니다.");
  }
  return expectedIndexes.map((index) => {
    const item = byIndex.get(index);
    if (!DECISIONS.includes(item.decision) || !Number.isInteger(item.priority) || item.priority < 0 || item.priority > 100
      || !["HIGH", "MEDIUM", "LOW"].includes(item.confidence)
      || typeof item.translatedTitleKo !== "string" || !item.translatedTitleKo.trim()
      || typeof item.analysisKo !== "string" || !item.analysisKo.trim()
      || !Array.isArray(item.positiveReasons) || typeof item.risksKo !== "string") {
      throw new Error(`LLM 응답 검증 실패 (itemIndex=${index}).`);
    }
    return { ...item, ticker: typeof item.ticker === "string" && item.ticker.trim() ? item.ticker.trim().toUpperCase() : null };
  });
}

async function analyzeBatch({ analyzeRssBatch, batch }) {
  const indexes = batch.map((item) => item.itemIndex);
  try {
    const result = await analyzeRssBatch(batch);
    return validateAnalysisBatch(result, indexes);
  } catch (error) {
    const recoverable = error instanceof Error && /결과 개수|itemIndex가 입력/.test(error.message);
    if (!recoverable || batch.length < 2) throw error;
    const midpoint = Math.ceil(batch.length / 2);
    const left = await analyzeBatch({ analyzeRssBatch, batch: batch.slice(0, midpoint) });
    const right = await analyzeBatch({ analyzeRssBatch, batch: batch.slice(midpoint) });
    return [...left, ...right];
  }
}

function analysisInput(article, itemIndex) {
  return {
    itemIndex,
    source: article.source,
    externalId: article.externalId,
    title: article.title.slice(0, 2000),
    summary: String(article.summary || "").slice(0, 3000),
    content: String(article.content || "").slice(0, 5000),
    link: safeUrl(article.link),
    publishedAt: article.publishedAt || null,
  };
}

function renderReport({ date, generatedAt, sourceUrl, articles, analyses, fetchedRssCount, analyzedRssCount, excludedCounts, sinceKst15 }) {
  const counts = Object.fromEntries(DECISIONS.map((decision) => [decision, analyses.filter((item) => item.decision === decision).length]));
  const sourceCounts = Object.fromEntries([...new Set(articles.map((item) => item.source))].sort().map((source) => [source, articles.filter((item) => item.source === source).length]));
  const rows = articles.map((article, index) => {
    const analysis = analyses[index];
    const link = safeUrl(article.link);
    const badgeClass = analysis.decision === "POSITIVE" ? "positive" : analysis.decision === "MIXED" ? "mixed" : "neutral";
    return `<article class="item ${badgeClass}"><div class="item-head"><span class="ticker">${escapeHtml(analysis.ticker || "티커 미확인")}</span><span class="badge ${badgeClass}">${escapeHtml(analysis.decision)} · ${escapeHtml(analysis.priority)}/100</span><span class="confidence">신뢰도 ${escapeHtml(analysis.confidence)}</span></div><h2>${escapeHtml(analysis.translatedTitleKo)}</h2><p class="original">${escapeHtml(article.title)}</p><div class="meta">${escapeHtml(article.source)} · ${escapeHtml(article.publishedAt || "발행시각 미확인")} · ${escapeHtml(analysis.eventType)}</div><p class="analysis">${escapeHtml(analysis.analysisKo)}</p>${analysis.positiveReasons.length ? `<section><h3>호재 근거</h3><ul>${analysis.positiveReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></section>` : ""}<section class="risk"><h3>위험·확인할 점</h3><p>${escapeHtml(analysis.risksKo || "RSS 정보만으로 확인 가능한 위험이 제한적입니다.")}</p></section><details><summary>RSS 원문 요약</summary><p>${escapeHtml(article.summary || article.content || "요약/본문 없음")}</p></details>${link ? `<a class="source-link" href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">원문 열기 ↗</a>` : "<span class=\"source-link disabled\">원문 링크 없음</span>"}</article>`;
  }).join("\n");
  const sourceSummary = Object.entries(sourceCounts).map(([source, count]) => `${escapeHtml(source)} ${count}건`).join(" · ") || "RSS 없음";
  const scopeLabel = sinceKst15 ? "KST 15:00 이후" : "KST 하루 전체";
  const excludedLabel = sinceKst15
    ? `<p>시간창 제외: 발행시각 누락/불명확 ${excludedCounts.invalidTimestamp}건 · 기준일 외 ${excludedCounts.otherKstDate}건 · 15:00 이전 ${excludedCounts.beforeWindow}건 · 실행시각 이후 ${excludedCounts.future}건</p>`
    : "";
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSS 호재 분석 보고서 · ${escapeHtml(date)}</title>
<style>
:root{color-scheme:dark;--bg:#09111f;--panel:#101b2d;--line:#26364e;--muted:#9cafc8;--text:#edf4ff;--mint:#67e8c4;--gold:#ffd27a;--red:#ff9b9b;--blue:#8ab4ff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(1000px 500px at 90% -10%,#173050 0,transparent 65%),var(--bg);color:var(--text);font:15px/1.65 Inter,"Segoe UI",Arial,sans-serif}main{max-width:1180px;margin:auto;padding:42px 24px 72px}.eyebrow{color:var(--mint);font-size:12px;font-weight:800;letter-spacing:.16em}h1{font-size:clamp(30px,5vw,48px);line-height:1.15;margin:10px 0}.lead{color:#c0cde0}.stats{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:12px;margin:26px 0}.stat,.panel,.item{background:linear-gradient(150deg,#14233a,#101a2b);border:1px solid var(--line);border-radius:16px}.stat{padding:16px}.stat b{display:block;font-size:27px;color:var(--mint)}.stat span,.meta,.confidence{font-size:12px;color:var(--muted)}.panel{padding:18px 21px;margin:16px 0}.item{padding:22px;margin:15px 0;border-left:4px solid var(--line)}.item.positive{border-left-color:var(--mint)}.item.mixed{border-left-color:var(--gold)}.item-head{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.ticker{font-weight:850;font-size:17px}.badge{border-radius:999px;padding:3px 10px;font-size:11px;font-weight:800}.badge.positive{color:var(--mint);background:#10372f}.badge.mixed{color:var(--gold);background:#3a2d16}.badge.neutral{color:#c5d2e4;background:#26364e}.item h2{font-size:22px;line-height:1.35;margin:13px 0 5px}.original{color:var(--muted);font-size:13px;margin:0 0 12px}.analysis{font-size:16px;color:#d9f8ef}.item section{margin:16px 0}.item h3{font-size:13px;color:var(--mint);margin:0 0 5px}.risk h3{color:var(--gold)}ul{margin:5px 0;padding-left:22px}.source-link{display:inline-block;margin-top:12px;color:var(--blue);text-decoration:none}.disabled{color:var(--muted)}details{color:#bac8da;font-size:13px}footer{color:var(--muted);font-size:12px;margin-top:30px}.empty{padding:28px;text-align:center;color:var(--muted)}@media(max-width:700px){main{padding:28px 15px}.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.item{padding:17px}.item h2{font-size:19px}}@media print{body{background:#fff;color:#111}.stat,.panel,.item{background:#fff;color:#111;border-color:#bbb;break-inside:avoid}.lead,.original,.meta,.confidence,footer{color:#444}.stats{grid-template-columns:repeat(5,1fr)}a{color:#124a9c}}
</style></head><body><main><div class="eyebrow">LOCAL LLM · RSS CATALYST REVIEW</div><h1>미국 RSS 호재 분석 보고서</h1><p class="lead">기준일 ${escapeHtml(date)} · ${scopeLabel} · 분석 RSS ${articles.length}/${fetchedRssCount}건 · 생성 ${escapeHtml(generatedAt)}</p><div class="stats"><div class="stat"><b>${articles.length}</b><span>분석 RSS</span></div><div class="stat"><b>${counts.POSITIVE}</b><span>긍정</span></div><div class="stat"><b>${counts.MIXED}</b><span>혼재</span></div><div class="stat"><b>${counts.NEUTRAL}</b><span>중립</span></div><div class="stat"><b>${counts.NEGATIVE + counts.INSUFFICIENT}</b><span>부정·근거부족</span></div></div><section class="panel"><h2>검토 범위와 기준</h2><p>운영 API에서 해당 KST 날짜의 RSS만 조회하고, 각 항목을 LLM이 직접 한국어로 분석했습니다. 코드 키워드 분류기와 번역 전용 서비스를 사용하지 않았습니다.</p><p>출처별: ${sourceSummary}</p>${excludedLabel}<p>원문 API: ${escapeHtml(sourceUrl)}</p><p>이 보고서는 RSS에 기재된 정보의 분석이며 투자 권유, 적정가치 또는 주가 상승 보장이 아닙니다. confidence는 모델의 정성 평가이지 상승 확률이 아닙니다.</p></section>${articles.length ? rows : `<section class="panel empty">${escapeHtml(date)} ${scopeLabel}에 분석 가능한 RSS가 없습니다.</section>`}<footer>LLM 직접 분석 · 운영 API는 조회 전용으로 사용 · 운영 호재 저장/수정 없음 · 금융 조언 아님</footer></main></body></html>`;
}

export async function runLocalRssBullishReport({
  apiBaseUrl,
  date,
  sinceKst15 = false,
  outputDir = join(process.env.USERPROFILE || homedir(), "Downloads"),
  analyzeRssBatch,
  fetchImpl = fetch,
  onProgress = () => {},
  now = new Date(),
} = {}) {
  const reportDate = validateDate(date || kstDate(now));
  if (sinceKst15 && reportDate !== kstDate(now)) throw new Error("KST 15:00 이후 필터는 오늘 날짜 보고서에서만 사용할 수 있습니다.");
  const baseUrl = validateApiBaseUrl(apiBaseUrl || "");
  if (typeof analyzeRssBatch !== "function") throw new Error("호출자가 로컬 LLM 분석 함수를 제공해야 합니다. API 키 기반 외부 LLM 호출은 지원하지 않습니다.");
  const endpoint = new URL("/api/disclosures", baseUrl);
  endpoint.searchParams.set("date", reportDate);
  endpoint.searchParams.set("source", "ALL");
  const dataResponse = await fetchImpl(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!dataResponse.ok) throw new Error(`운영 RSS API 요청 실패 (HTTP ${dataResponse.status}).`);
  const data = await dataResponse.json();
  if (data?.ok !== true || data.date !== reportDate || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total !== data.items.length) {
    throw new Error("운영 API 응답의 성공 여부·기준일·전체 건수·items를 확인하지 못했습니다.");
  }
  const fetchedArticles = data.items.filter((article) => article?.sourceType === "RSS");
  if (fetchedArticles.some((article) => !validateArticle(article))) throw new Error("운영 API에 필수 RSS 원문 필드가 누락된 항목이 있습니다.");
  const excludedCounts = { invalidTimestamp: 0, otherKstDate: 0, beforeWindow: 0, future: 0 };
  let articles = fetchedArticles;
  if (sinceKst15) {
    const nowMs = now.getTime();
    const startMs = Date.parse(`${reportDate}T06:00:00.000Z`);
    articles = fetchedArticles.filter((article) => {
      const raw = String(article.publishedAt || "");
      if (!raw || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) { excludedCounts.invalidTimestamp += 1; return false; }
      const publishedMs = Date.parse(raw);
      if (!Number.isFinite(publishedMs)) { excludedCounts.invalidTimestamp += 1; return false; }
      if (kstDate(new Date(publishedMs)) !== reportDate) { excludedCounts.otherKstDate += 1; return false; }
      if (publishedMs < startMs) { excludedCounts.beforeWindow += 1; return false; }
      if (publishedMs > nowMs) { excludedCounts.future += 1; return false; }
      return true;
    });
  }

  const analyses = [];
  let completed = 0;
  for (let start = 0; start < articles.length; start += BATCH_SIZE) {
    const batchArticles = articles.slice(start, start + BATCH_SIZE);
    const batch = batchArticles.map((article, index) => analysisInput(article, start + index));
    analyses.push(...await analyzeBatch({ analyzeRssBatch, batch }));
    completed += batch.length;
    onProgress({ completed, total: articles.length });
  }

  const generatedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium",
  }).format(now);
  const html = filterReportToPositiveKnownTickers(renderReport({ date: reportDate, generatedAt, sourceUrl: endpoint.href, articles, analyses, fetchedRssCount: fetchedArticles.length, analyzedRssCount: articles.length, excludedCounts, sinceKst15 }));
  if (html.includes("\uFFFD")) throw new Error("생성된 HTML에서 한글 인코딩 대체 문자를 발견했습니다.");
  mkdirSync(outputDir, { recursive: true });
  const filename = `operating-rss-bullish-foreign-${reportDate}${sinceKst15 ? "-kst-after-1500" : ""}.html`;
  const filePath = resolve(outputDir, filename);
  writeFileSync(filePath, html, { encoding: "utf8", flag: "w" });
  return {
    date: reportDate,
    sinceKst15,
    fetchedRss: fetchedArticles.length,
    totalRss: articles.length,
    excludedCounts,
    positive: analyses.filter((item) => item.decision === "POSITIVE" && isClearTickerSymbol(item.ticker)).length,
    filePath,
    bytes: Buffer.byteLength(html, "utf8"),
  };
}

export async function prepareRssInputForCodex({
  apiBaseUrl,
  date,
  sinceKst15 = false,
  tempRoot = join(tmpdir(), "rss-bullish-codex"),
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const reportDate = validateDate(date || kstDate(now));
  if (sinceKst15 && reportDate !== kstDate(now)) throw new Error("KST 15:00 이후 필터는 오늘 날짜에서만 사용할 수 있습니다.");
  const baseUrl = validateApiBaseUrl(apiBaseUrl || "");
  const endpoint = new URL("/api/disclosures", baseUrl);
  endpoint.searchParams.set("date", reportDate);
  endpoint.searchParams.set("source", "ALL");
  const response = await fetchImpl(endpoint, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`운영 RSS API 요청 실패 (HTTP ${response.status}).`);
  const data = await response.json();
  if (data?.ok !== true || data.date !== reportDate || !Array.isArray(data.items) || !Number.isSafeInteger(data.total) || data.total !== data.items.length) {
    throw new Error("운영 API 응답의 성공 여부·기준일·전체 건수·items를 확인하지 못했습니다.");
  }
  const rssItems = data.items.filter((item) => item?.sourceType === "RSS");
  if (rssItems.some((item) => !validateArticle(item))) throw new Error("운영 API에 필수 RSS 원문 필드가 누락된 항목이 있습니다.");
  const excludedCounts = { invalidTimestamp: 0, otherKstDate: 0, beforeWindow: 0, future: 0 };
  let selected = rssItems;
  if (sinceKst15) {
    const startMs = Date.parse(`${reportDate}T06:00:00.000Z`);
    const nowMs = now.getTime();
    selected = rssItems.filter((article) => {
      const raw = String(article.publishedAt || "");
      if (!raw || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) { excludedCounts.invalidTimestamp += 1; return false; }
      const publishedMs = Date.parse(raw);
      if (!Number.isFinite(publishedMs)) { excludedCounts.invalidTimestamp += 1; return false; }
      if (kstDate(new Date(publishedMs)) !== reportDate) { excludedCounts.otherKstDate += 1; return false; }
      if (publishedMs < startMs) { excludedCounts.beforeWindow += 1; return false; }
      if (publishedMs > nowMs) { excludedCounts.future += 1; return false; }
      return true;
    });
  }
  const prepared = {
    date: reportDate,
    sinceKst15,
    sourceUrl: endpoint.href,
    fetchedRssCount: rssItems.length,
    analyzedRssCount: selected.length,
    excludedCounts,
    articles: selected.map((article, index) => analysisInput(article, index)),
  };
  mkdirSync(tempRoot, { recursive: true });
  const inputPath = resolve(tempRoot, `rss-bullish-${reportDate}-${randomUUID()}.json`);
  writeFileSync(inputPath, JSON.stringify(prepared), { encoding: "utf8", flag: "wx" });
  return { inputPath, date: reportDate, fetchedRss: rssItems.length, analyzedRss: selected.length, excludedCounts };
}

export function renderCodexAnalysisToReport({ prepared, analysis, outputDir = join(process.env.USERPROFILE || homedir(), "Downloads"), now = new Date() } = {}) {
  if (!prepared || !Array.isArray(prepared.articles) || prepared.analyzedRssCount !== prepared.articles.length
    || !Number.isSafeInteger(prepared.fetchedRssCount) || prepared.fetchedRssCount < prepared.articles.length) {
    throw new Error("Codex 분석 입력 파일의 기준일·범위·RSS 항목이 유효하지 않습니다.");
  }
  const reportDate = validateDate(prepared.date);
  const articles = prepared.articles;
  const analyses = validateAnalysisBatch(analysis, articles.map((item) => item.itemIndex));
  const generatedAt = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "medium",
  }).format(now);
  const html = filterReportToPositiveKnownTickers(renderReport({
    date: reportDate,
    generatedAt,
    sourceUrl: safeUrl(prepared.sourceUrl),
    articles,
    analyses,
    fetchedRssCount: prepared.fetchedRssCount,
    analyzedRssCount: articles.length,
    excludedCounts: prepared.excludedCounts || { invalidTimestamp: 0, otherKstDate: 0, beforeWindow: 0, future: 0 },
    sinceKst15: prepared.sinceKst15 === true,
  }));
  if (html.includes("\uFFFD")) throw new Error("생성된 HTML에서 한글 인코딩 대체 문자를 발견했습니다.");
  mkdirSync(outputDir, { recursive: true });
  const filename = `operating-rss-bullish-foreign-${reportDate}${prepared.sinceKst15 ? "-kst-after-1500" : ""}.html`;
  const filePath = resolve(outputDir, filename);
  writeFileSync(filePath, html, { encoding: "utf8", flag: "w" });
  return { filePath, analyzedRss: articles.length, includedItems: [...html.matchAll(/<article class="item /g)].length, bytes: Buffer.byteLength(html, "utf8") };
}

export function appendCodexAnalysisBatch({ prepared, results, batchOffset, analysisPath } = {}) {
  if (!prepared || !Array.isArray(prepared.articles) || !Number.isSafeInteger(batchOffset) || batchOffset < 0 || batchOffset >= prepared.articles.length) {
    throw new Error("Codex 분석 batch의 준비 파일 또는 offset이 유효하지 않습니다.");
  }
  const expectedIndexes = prepared.articles.slice(batchOffset, batchOffset + BATCH_SIZE).map((item) => item.itemIndex);
  const validated = validateAnalysisBatch({ results }, expectedIndexes);
  const previous = existsSync(analysisPath) ? JSON.parse(readFileSync(analysisPath, "utf8")) : { results: [] };
  if (!Array.isArray(previous.results)) throw new Error("기존 Codex 분석 파일의 results 배열이 유효하지 않습니다.");
  const existingIndexes = new Set(previous.results.map((item) => item.itemIndex));
  if (validated.some((item) => existingIndexes.has(item.itemIndex))) throw new Error("이미 저장된 itemIndex가 있어 중복 batch 추가를 거부했습니다.");
  const combined = [...previous.results, ...validated].sort((a, b) => a.itemIndex - b.itemIndex);
  mkdirSync(dirname(resolve(analysisPath)), { recursive: true });
  writeFileSync(analysisPath, JSON.stringify({ results: combined }), { encoding: "utf8", flag: "w" });
  return { analysisPath: resolve(analysisPath), completed: combined.length, total: prepared.articles.length };
}

function parseArgs(args) {
  const result = { help: false, prepare: false, inputFile: undefined, analysisFile: undefined, analysisOutput: undefined, recordResultsBase64: undefined, batchOffset: undefined, batchSize: 8, date: undefined, sinceKst15: false, filterExistingPositiveKnownTicker: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--help" || args[index] === "-h") result.help = true;
    else if (args[index] === "--prepare") result.prepare = true;
    else if (args[index] === "--input" && args[index + 1]) result.inputFile = resolve(args[++index]);
    else if (args[index] === "--analysis" && args[index + 1]) result.analysisFile = resolve(args[++index]);
    else if (args[index] === "--analysis-output" && args[index + 1]) result.analysisOutput = resolve(args[++index]);
    else if (args[index] === "--record-results-base64" && args[index + 1]) result.recordResultsBase64 = args[++index];
    else if (args[index] === "--batch-offset" && args[index + 1]) {
      const offset = Number(args[++index]);
      if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("--batch-offset은 0 이상의 정수여야 합니다.");
      result.batchOffset = offset;
    }
    else if (args[index] === "--batch-size" && args[index + 1]) {
      const size = Number(args[++index]);
      if (!Number.isSafeInteger(size) || size < 1 || size > BATCH_SIZE) throw new Error(`--batch-size는 1~${BATCH_SIZE} 정수여야 합니다.`);
      result.batchSize = size;
    }
    else if (args[index] === "--date" && args[index + 1]) result.date = validateDate(args[++index]);
    else if (args[index] === "--since-kst-15") result.sinceKst15 = true;
    else if (args[index] === "--filter-existing-positive-known-ticker") result.filterExistingPositiveKnownTicker = true;
    else throw new Error(`지원하지 않는 인수입니다: ${args[index]}`);
  }
  return result;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("사용법:\n  npm.cmd run report:rss-bullish -- --prepare [--date YYYY-MM-DD] [--since-kst-15]\n  npm.cmd run report:rss-bullish -- --input <준비JSON> --batch-offset <0-based> [--batch-size 1..8]\n  npm.cmd run report:rss-bullish -- --input <준비JSON> --batch-offset <0-based> --record-results-base64 <Codex결과JSON-base64>\n  npm.cmd run report:rss-bullish -- --input <준비JSON> --analysis <Codex분석JSON>\n  npm.cmd run report:rss-bullish -- --date YYYY-MM-DD --filter-existing-positive-known-ticker\n준비 단계는 운영 RSS GET만 수행하고, 분석은 이 Codex가 직접 합니다. API key를 사용하지 않습니다.");
    return;
  }
  if (options.filterExistingPositiveKnownTicker) {
    const date = options.date || kstDate();
    const suffix = options.sinceKst15 ? "-kst-after-1500" : "";
    const filePath = resolve(join(process.env.USERPROFILE || homedir(), "Downloads", `operating-rss-bullish-foreign-${date}${suffix}.html`));
    const original = readFileSync(filePath, "utf8");
    const filtered = filterReportToPositiveKnownTickers(original);
    if (filtered.includes("\uFFFD")) throw new Error("필터링한 HTML에서 한글 인코딩 대체 문자를 발견했습니다.");
    writeFileSync(filePath, filtered, { encoding: "utf8", flag: "w" });
    console.log(JSON.stringify({ filePath, includedItems: [...filtered.matchAll(/<article class="item /g)].length, bytes: Buffer.byteLength(filtered, "utf8") }, null, 2));
    return;
  }
  if (options.prepare) {
    if (options.inputFile || options.analysisFile) throw new Error("--prepare와 --input/--analysis는 함께 쓸 수 없습니다.");
    const localEnv = readLocalEnvFile();
    const result = await prepareRssInputForCodex({
      apiBaseUrl: localEnv.RSS_BULLISH_REPORT_API_BASE_URL || process.env.RSS_BULLISH_REPORT_API_BASE_URL,
      date: options.date,
      sinceKst15: options.sinceKst15,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (options.inputFile && options.batchOffset !== undefined && !options.analysisFile) {
    const prepared = JSON.parse(readFileSync(options.inputFile, "utf8"));
    if (!Array.isArray(prepared.articles)) throw new Error("준비된 RSS JSON에 articles 배열이 없습니다.");
    if (options.recordResultsBase64) {
      const results = JSON.parse(Buffer.from(options.recordResultsBase64, "base64").toString("utf8"));
      const analysisPath = options.analysisOutput || options.inputFile.replace(/\.json$/i, ".analysis.json");
      console.log(JSON.stringify(appendCodexAnalysisBatch({ prepared, results, batchOffset: options.batchOffset, analysisPath }), null, 2));
      return;
    }
    console.log(JSON.stringify(prepared.articles.slice(options.batchOffset, options.batchOffset + options.batchSize), null, 2));
    return;
  }
  if (options.inputFile && options.analysisFile && options.batchOffset === undefined) {
    const prepared = JSON.parse(readFileSync(options.inputFile, "utf8"));
    const analysis = JSON.parse(readFileSync(options.analysisFile, "utf8"));
    console.log(JSON.stringify(renderCodexAnalysisToReport({ prepared, analysis }), null, 2));
    return;
  }
  throw new Error("먼저 --prepare로 RSS를 받아오세요. 이 Codex가 직접 분석한 후 --input과 --analysis를 지정하면 HTML을 저장합니다.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`[rss-bullish-report] ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    process.exitCode = 1;
  });
}

export { escapeHtml, isClearTickerSymbol, kstDate, parseArgs, renderReport, validateAnalysisBatch, validateApiBaseUrl };
