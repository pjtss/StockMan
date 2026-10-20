import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendCodexAnalysisBatch, filterReportToPositiveKnownTickers, parseArgs, prepareRssInputForCodex, renderCodexAnalysisToReport, runLocalRssBullishReport, validateApiBaseUrl } from "./local-rss-bullish-report.mjs";

const tempDirs: string[] = [];
function tempOutputDir() {
  const directory = mkdtempSync(join(tmpdir(), "rss-bullish-report-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("local RSS bullish report", () => {
  it("allows HTTPS origin only, without credentials or path", () => {
    expect(validateApiBaseUrl("https://rss.example.com")).toBe("https://rss.example.com");
    expect(() => validateApiBaseUrl("http://rss.example.com")).toThrow(/HTTPS/);
    expect(() => validateApiBaseUrl("https://user:pass@rss.example.com")).toThrow(/origin/);
    expect(() => validateApiBaseUrl("https://rss.example.com/path")).toThrow(/origin/);
  });

  it("accepts the explicit KST 15:00 filter flag", () => {
    expect(parseArgs(["--since-kst-15"])).toMatchObject({ sinceKst15: true });
    expect(parseArgs(["--date", "2026-09-25"])).toMatchObject({ date: "2026-09-25", sinceKst15: false });
    expect(parseArgs(["--filter-existing-positive-known-ticker"])).toMatchObject({ filterExistingPositiveKnownTicker: true });
    expect(parseArgs(["--input", "prepared.json", "--batch-offset", "16", "--batch-size", "8"]))
      .toMatchObject({ inputFile: expect.stringContaining("prepared.json"), batchOffset: 16, batchSize: 8 });
    expect(parseArgs(["--record-results-base64", "e30="]))
      .toMatchObject({ recordResultsBase64: "e30=" });
    expect(() => parseArgs(["--batch-size", "9"])).toThrow(/1~8/);
  });

  it("reads all RSS rows from the operating API, directly analyzes them, and writes only a local HTML file", async () => {
    const outputDir = tempOutputDir();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        date: "2026-09-25",
        total: 3,
        items: [
          { sourceType: "RSS", source: "NASDAQ", externalId: "nvda-1", title: "NVIDIA wins $2B contract", summary: "Multi-year supply agreement", content: "Contract details", link: "https://example.com/nvda", publishedAt: "2026-09-25T12:00:00Z" },
          { sourceType: "DART", source: "DART", externalId: "dart-1", title: "ignored non-RSS filing" },
          { sourceType: "RSS", source: "SEC_EDGAR", externalId: "sec-1", title: "Company raises guidance", summary: "Revenue forecast increased" },
        ],
      }), { status: 200 }));
    const analyzeRssBatch = vi.fn().mockResolvedValue({ results: [{
          itemIndex: 0, decision: "POSITIVE", ticker: "NVDA", eventType: "계약", translatedTitleKo: "엔비디아, 20억 달러 공급 계약 수주",
          analysisKo: "다년 공급 계약이 매출 가시성을 높일 수 있습니다.", positiveReasons: ["계약 규모가 구체적으로 공개됐습니다."], risksKo: "계약 기간별 매출 인식 조건을 확인해야 합니다.", priority: 82, confidence: "MEDIUM",
        }, {
          itemIndex: 1, decision: "INSUFFICIENT", ticker: null, eventType: "가이던스", translatedTitleKo: "회사가 전망을 상향했습니다",
          analysisKo: "RSS 정보만으로 상향 폭과 기준을 확인할 수 없습니다.", positiveReasons: [], risksKo: "비교 기준과 상향 폭이 제공되지 않았습니다.", priority: 15, confidence: "LOW",
        }] });

    const result = await runLocalRssBullishReport({
      apiBaseUrl: "https://rss.example.com",
      date: "2026-09-25",
      outputDir,
      fetchImpl,
      analyzeRssBatch,
      now: new Date("2026-09-26T01:00:00Z"),
    });

    expect(result).toMatchObject({ date: "2026-09-25", totalRss: 2, positive: 1, bytes: expect.any(Number) });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(analyzeRssBatch).toHaveBeenCalledTimes(1);
    const apiUrl = new URL(fetchImpl.mock.calls[0][0] as string);
    expect(apiUrl.pathname).toBe("/api/disclosures");
    expect(apiUrl.searchParams.get("date")).toBe("2026-09-25");
    expect(apiUrl.searchParams.get("source")).toBe("ALL");
    const analyzedItems = analyzeRssBatch.mock.calls[0][0];
    expect(analyzedItems.map((item: { title: string }) => item.title)).toContain("NVIDIA wins $2B contract");
    expect(analyzedItems.map((item: { title: string }) => item.title)).toContain("Company raises guidance");

    const html = readFileSync(result.filePath, "utf8");
    expect(html).toContain("엔비디아, 20억 달러 공급 계약 수주");
    expect(html).toContain("호재 근거");
    expect(html).toContain("위험·확인할 점");
    expect(html).not.toContain("ignored non-RSS filing");
    expect(html).not.toContain("Company raises guidance");
    expect(html).toContain("호재 1건만 수록 (티커 확인)");
    expect([...html.matchAll(/<article class="item /g)]).toHaveLength(1);
    expect(html).not.toContain("\uFFFD");
    expect(html).toContain("운영 API는 조회 전용");
  });

  it("does not analyze or write a report when the API date does not match", async () => {
    const outputDir = tempOutputDir();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, date: "2026-09-24", items: [] }), { status: 200 }));
    const analyzeRssBatch = vi.fn();
    await expect(runLocalRssBullishReport({
      apiBaseUrl: "https://rss.example.com", date: "2026-09-25", outputDir, fetchImpl, analyzeRssBatch,
    })).rejects.toThrow(/기준일/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(analyzeRssBatch).not.toHaveBeenCalled();
    expect(() => readFileSync(join(outputDir, "operating-rss-bullish-foreign-2026-09-25.html"))).toThrow();
  });

  it("splits and retries a batch whose LLM result count is incomplete", async () => {
    const outputDir = tempOutputDir();
    const resultFor = (itemIndex: number) => ({
      itemIndex, decision: "NEUTRAL", ticker: null, eventType: "뉴스", translatedTitleKo: `항목 ${itemIndex}`,
      analysisKo: "기업 촉매를 확인할 수 없습니다.", positiveReasons: [], risksKo: "추가 확인이 필요합니다.", priority: 0, confidence: "LOW",
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ok: true, date: "2026-09-25", total: 2,
        items: [0, 1].map((id) => ({ sourceType: "RSS", source: "NASDAQ", externalId: String(id), title: `Headline ${id}` })),
      }), { status: 200 }));
    const analyzeRssBatch = vi.fn()
      .mockResolvedValueOnce({ results: [resultFor(0)] })
      .mockResolvedValueOnce({ results: [resultFor(0)] })
      .mockResolvedValueOnce({ results: [resultFor(1)] });

    const result = await runLocalRssBullishReport({
      apiBaseUrl: "https://rss.example.com", date: "2026-09-25", outputDir, fetchImpl, analyzeRssBatch,
    });

    expect(result.totalRss).toBe(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(analyzeRssBatch).toHaveBeenCalledTimes(3);
    expect(readFileSync(result.filePath, "utf8")).toContain("호재 0건만 수록 (티커 확인)");
  });

  it("includes only positive items with a clear ticker symbol", () => {
    const card = (decision: string, ticker: string, title: string) => `<article class="item ${decision.toLowerCase()}"><span class="ticker">${ticker}</span><h2>${title}</h2></article>`;
    const html = `<p class="lead">기준일 2026-09-25 · KST 하루 전체 · 분석 RSS 3/3건 · 생성 16:00</p><div class="stats"><div class="stat"><b>3</b><span>분석 RSS</span></div><div class="stat"><b>1</b><span>긍정</span></div></div><p>출처별: NASDAQ 3건</p>${card("positive", "NVDA", "good")}${card("positive", "티커 미확인", "missing ticker")}${card("neutral", "AAPL", "not bullish")}`;
    const filtered = filterReportToPositiveKnownTickers(html);

    expect(filtered).toContain("good");
    expect(filtered).not.toContain("missing ticker");
    expect(filtered).not.toContain("not bullish");
    expect(filtered).toContain("호재 1건만 수록 (티커 확인)");
    expect(filtered).toContain("분석 대상 RSS</span>");
    expect([...filtered.matchAll(/<article class="item /g)]).toHaveLength(1);
  });

  it("prepares RSS using a single GET and renders Codex-provided analysis without an external LLM call", async () => {
    const tempRoot = tempOutputDir();
    const outputDir = tempOutputDir();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true, date: "2026-09-25", total: 3,
      items: [
        { sourceType: "RSS", source: "NASDAQ", externalId: "nvda", title: "NVIDIA wins contract", summary: "Awarded a supply agreement" },
        { sourceType: "RSS", source: "NASDAQ", externalId: "unknown", title: "Company announces event", summary: "Details unavailable" },
        { sourceType: "DART", source: "DART", externalId: "filing", title: "Not RSS" },
      ],
    }), { status: 200 }));
    const preparedMeta = await prepareRssInputForCodex({
      apiBaseUrl: "https://rss.example.com", date: "2026-09-25", tempRoot, fetchImpl,
    });
    const prepared = JSON.parse(readFileSync(preparedMeta.inputPath, "utf8"));
    const analysis = { results: [
        { itemIndex: 0, decision: "POSITIVE", ticker: "NVDA", eventType: "계약", translatedTitleKo: "엔비디아 계약 수주", analysisKo: "구체적인 계약이 확인됩니다.", positiveReasons: ["공급 계약 체결"], risksKo: "금액과 기간을 확인해야 합니다.", priority: 80, confidence: "MEDIUM" },
        { itemIndex: 1, decision: "INSUFFICIENT", ticker: null, eventType: "기타", translatedTitleKo: "회사 행사 발표", analysisKo: "기업 촉매를 확인할 수 없습니다.", positiveReasons: [], risksKo: "세부 정보가 부족합니다.", priority: 0, confidence: "LOW" },
      ] };
    const analysisPath = join(tempRoot, "codex-analysis.json");
    expect(appendCodexAnalysisBatch({ prepared, results: analysis.results, batchOffset: 0, analysisPath }))
      .toMatchObject({ completed: 2, total: 2 });
    expect(() => appendCodexAnalysisBatch({ prepared, results: analysis.results, batchOffset: 0, analysisPath })).toThrow(/중복/);
    const recordedAnalysis = JSON.parse(readFileSync(analysisPath, "utf8"));
    const rendered = renderCodexAnalysisToReport({
      prepared, analysis: recordedAnalysis, outputDir, now: new Date("2026-09-25T15:00:00Z"),
    });

    expect(preparedMeta).toMatchObject({ fetchedRss: 2, analyzedRss: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rendered).toMatchObject({ analyzedRss: 2, includedItems: 1 });
    const html = readFileSync(rendered.filePath, "utf8");
    expect(html).toContain("엔비디아 계약 수주");
    expect(html).not.toContain("회사 행사 발표");
  });

  it("applies the explicit KST 15:00 inclusive window and reports every exclusion", async () => {
    const outputDir = tempOutputDir();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        ok: true, date: "2026-09-26", total: 4,
        items: [
          { sourceType: "RSS", source: "NASDAQ", externalId: "at-cutoff", title: "At cutoff", summary: "valid", publishedAt: "2026-09-26T06:00:00Z" },
          { sourceType: "RSS", source: "NASDAQ", externalId: "before-cutoff", title: "Before cutoff", summary: "old", publishedAt: "2026-09-26T05:59:59Z" },
          { sourceType: "RSS", source: "NASDAQ", externalId: "future", title: "Future", summary: "future", publishedAt: "2026-09-26T10:00:01Z" },
          { sourceType: "RSS", source: "NASDAQ", externalId: "unknown-time", title: "Unknown time", summary: "no time" },
        ],
      }), { status: 200 }));
    const analyzeRssBatch = vi.fn().mockResolvedValue({ results: [{ itemIndex: 0, decision: "POSITIVE", ticker: "AAPL", eventType: "기타", translatedTitleKo: "기준시각 RSS", analysisKo: "기준 시각을 포함합니다.", positiveReasons: ["15시 정각"], risksKo: "없음", priority: 60, confidence: "MEDIUM" }] });

    const result = await runLocalRssBullishReport({
      apiBaseUrl: "https://rss.example.com", date: "2026-09-26", sinceKst15: true,
      outputDir, fetchImpl, analyzeRssBatch, now: new Date("2026-09-26T10:00:00Z"),
    });

    expect(result).toMatchObject({ fetchedRss: 4, totalRss: 1, positive: 1, sinceKst15: true });
    expect(result.excludedCounts).toEqual({ invalidTimestamp: 1, otherKstDate: 0, beforeWindow: 1, future: 1 });
    expect(result.filePath).toContain("kst-after-1500");
    const html = readFileSync(result.filePath, "utf8");
    expect(html).toContain("KST 15:00 이후");
    expect(html).toContain("RSS 1건 분석 · 호재 1건만 수록 (티커 확인)");
    expect(html).toContain("15:00 이전 1건");
    expect(html).not.toContain("Before cutoff");
  });
});
