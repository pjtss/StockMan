import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildTranslationReviewFixture, importTranslationReviewCsvFile, parseTranslationReviewCsv, writeFixtureAtomically } from "./market-rss-translation-review-import.mjs";
import type { TranslationReviewFixture } from "./market-rss-translation-review-import.mjs";
import { buildMarketRssTranslationReviewCsv } from "../lib/market-rss-translation-review-export";

const header = ["검수 판정(정확/자동검사 오탐 확인/부분번역/오역/보류)", "원문 제목", "원문 요약 (참고)", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const previousCurrentHeader = ["검수 판정(정확/부분번역/오역/보류)", "원문 제목", "원문 요약 (참고)", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const previousHeader = previousCurrentHeader.filter((column) => column !== "원문 요약 (참고)");
const legacyHeader = previousHeader.filter((column) => column !== "외부 기사 ID");
const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
const csv = (rows: string[][]) => `\uFEFF${[header, ...rows].map((row) => row.map(quote).join(",")).join("\r\n")}`;
const row = (verdict: string, correction = "", overrides: Partial<Record<string, string>> = {}) => [
  verdict,
  overrides.originalTitle || "NVDA revenue rises 20%",
  overrides.summary ?? "Quarterly revenue increased after management raised its annual outlook.",
  overrides.translatedTitle || "엔비디아(NVDA) 매출 20% 증가",
  overrides.ticker || "NVDA",
  overrides.source || "NASDAQ",
  overrides.externalId ?? `nasdaq-${overrides.originalTitle || "NVDA revenue rises 20%"}`,
  overrides.publishedAt || "2026-09-25T01:00:00.000Z",
  overrides.link === "" ? "" : overrides.link || "https://example.com/nvda",
  correction,
  overrides.notes === "" ? "" : overrides.notes || "수치와 방향성 확인",
];
const temporaryDirectories: string[] = [];

async function makeTemporaryFiles(csvText: string, existingFixture = { schemaVersion: 1, cases: [] }) {
  const directory = await mkdtemp(path.join(tmpdir(), "rss-translation-review-"));
  temporaryDirectories.push(directory);
  const inputPath = path.join(directory, "review.csv");
  const fixturePath = path.join(directory, "fixture.json");
  await writeFile(inputPath, csvText, "utf8");
  await writeFile(fixturePath, `${JSON.stringify(existingFixture)}\n`, "utf8");
  return { directory, inputPath, fixturePath };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("market RSS translation review CSV importer", () => {
  it("carries an incomplete provider candidate through export and human correction into the semantic fixture", () => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: "nasdaq-NVDA-quarterly-growth",
      title: "NVDA revenue rises 20% quarter over quarter",
      summary: "Quarterly revenue increased after management raised its annual outlook.",
      translatedTitle: "NVDA revenue rises 20% quarter over quarter",
      translationCandidateTitle: "엔비디아(NVDA) 매출 20% 증가",
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_output_incomplete",
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: "https://example.com/nvda-quarterly-growth",
    }]);
    const reviewedRows = parseTranslationReviewCsv(exported.content);
    reviewedRows[0][0] = "부분번역";
    reviewedRows[0][9] = "엔비디아(NVDA) 매출이 전 분기보다 20% 증가했습니다.";

    const imported = buildTranslationReviewFixture(csv(reviewedRows));

    expect(exported.count).toBe(1);
    expect(reviewedRows[0][3]).toBe("엔비디아(NVDA) 매출 20% 증가");
    expect(imported).toMatchObject({ importedCount: 1, heldCount: 0 });
    expect(imported.fixture.cases[0]).toMatchObject({
      originalTitle: "NVDA revenue rises 20% quarter over quarter",
      translatedTitle: "엔비디아(NVDA) 매출 20% 증가",
      expectedTitle: "엔비디아(NVDA) 매출이 전 분기보다 20% 증가했습니다.",
      verdict: "부분번역",
      externalId: "nasdaq-NVDA-quarterly-growth",
    });
  });

  it("imports a human-corrected numeric hallucination candidate while preserving the source financial token", () => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: "nasdaq-NVDA-numeric-hallucination",
      title: "NVDA revenue rises 20%",
      summary: "Quarterly revenue growth accelerated.",
      translatedTitle: "NVDA revenue rises 20%",
      translationCandidateTitle: "엔비디아 매출 25% 증가",
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_numeric_hallucination",
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: "https://example.com/nvda-numeric-hallucination",
    }]);
    const reviewedRows = parseTranslationReviewCsv(exported.content);
    reviewedRows[0][0] = "오역";
    reviewedRows[0][9] = "엔비디아(NVDA) 매출이 20% 증가했습니다.";

    const imported = buildTranslationReviewFixture(csv(reviewedRows));

    expect(reviewedRows[0][10]).toContain("RSS-REVIEW-CANDIDATE:numeric-hallucination");
    expect(imported.fixture.cases[0]).toMatchObject({
      translatedTitle: "엔비디아 매출 25% 증가",
      expectedTitle: "엔비디아(NVDA) 매출이 20% 증가했습니다.",
      verdict: "오역",
    });
  });

  it.each([
    "엔비디아(NVDA) 매출이 +20% 증가했습니다.",
    "엔비디아(NVDA) 매출이 25% 증가했습니다.",
  ])("rejects a human correction that changes a numeric hallucination candidate's source value: %s", (correction) => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: "nasdaq-NVDA-numeric-hallucination",
      title: "NVDA revenue rises 20%",
      summary: "Quarterly revenue growth accelerated.",
      translatedTitle: "NVDA revenue rises 20%",
      translationCandidateTitle: "엔비디아 매출 25% 증가",
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_numeric_hallucination",
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: "https://example.com/nvda-numeric-hallucination",
    }]);
    const reviewedRows = parseTranslationReviewCsv(exported.content);
    reviewedRows[0][0] = "오역";
    reviewedRows[0][9] = correction;

    expect(() => buildTranslationReviewFixture(csv(reviewedRows))).toThrow(/원문 숫자\/티커/);
  });

  it.each([
    ["translation_output_incomplete", "엔비디아(NVDA) 매출 20% 증가", "RSS-REVIEW-CANDIDATE:incomplete"],
    ["target_language_not_detected", "Nvidia revenue rises sharply 상승", "RSS-REVIEW-CANDIDATE:target-language"],
    ["translation_numeric_hallucination", "매출 25% 증가", "RSS-REVIEW-CANDIDATE:numeric-hallucination"],
    ["translation_cache_invalidation_failed", "매출 증가", "RSS-REVIEW-CANDIDATE:cache-invalidation"],
  ])("does not allow %s provider candidate to be approved as ordinary accurate", (reason, candidateTitle, marker) => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: `nasdaq-NVDA-${reason}`,
      title: "NVDA revenue rises 20%",
      summary: "Quarterly revenue increased after guidance improved.",
      translatedTitle: "NVDA revenue rises 20%",
      translationCandidateTitle: candidateTitle,
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: reason,
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: `https://example.com/nvda-${reason}`,
    }]);
    const reviewedRows = parseTranslationReviewCsv(exported.content);
    reviewedRows[0][0] = "정확";
    reviewedRows[0][9] = "";

    expect(reviewedRows[0][10]).toContain(marker);
    expect(() => buildTranslationReviewFixture(csv(reviewedRows))).toThrow(/자동검사 오탐임을 확인했으면/);
  });

  it("records a human-confirmed false positive from the automatic quality gate without inventing a correction", () => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: "nasdaq-NVDA-human-confirmed-false-positive",
      title: "NVDA revenue rises 20%",
      summary: "Quarterly revenue increased after guidance improved.",
      translatedTitle: "엔비디아(NVDA) 매출이 20% 증가했습니다.",
      translationCandidateTitle: "엔비디아(NVDA) 매출이 20% 증가했습니다.",
      translationStatus: "SKIPPED",
      translationFallback: true,
      translationSkippedReason: "translation_output_incomplete",
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: "https://example.com/nvda-false-positive",
    }]);
    const reviewedRows = parseTranslationReviewCsv(exported.content);
    reviewedRows[0][0] = "자동검사 오탐 확인";

    const imported = buildTranslationReviewFixture(csv(reviewedRows));

    expect(imported.fixture.cases[0]).toMatchObject({
      translatedTitle: "엔비디아(NVDA) 매출이 20% 증가했습니다.",
      expectedTitle: "엔비디아(NVDA) 매출이 20% 증가했습니다.",
      verdict: "자동검사 오탐 확인",
    });
  });

  it("does not allow the automatic-gate false-positive verdict without a retained candidate marker", () => {
    const values = row("자동검사 오탐 확인");
    expect(() => buildTranslationReviewFixture(csv([values]))).toThrow(/후보 표식이 없어/);
  });

  it("round-trips an exported administrator review row into the semantic fixture format", () => {
    const exported = buildMarketRssTranslationReviewCsv([{
      externalId: "nasdaq-NVDA-2026-09-25",
      title: "NVDA revenue rises 20%",
      summary: "Quarterly revenue increased after management raised its annual outlook.",
      translatedTitle: "엔비디아(NVDA) 매출 20% 증가",
      translationStatus: "TRANSLATED",
      translationFallback: false,
      translationSkippedReason: null,
      detectedTicker: "NVDA",
      source: "NASDAQ",
      publishedAt: "2026-09-25T01:00:00.000Z",
      link: "https://example.com/nvda",
    }]);
    const exportedRows = parseTranslationReviewCsv(exported.content);
    exportedRows[0][0] = "정확";
    const reviewedCsv = csv(exportedRows);

    const imported = buildTranslationReviewFixture(reviewedCsv);

    expect(exported.count).toBe(1);
    expect(imported).toMatchObject({ importedCount: 1, heldCount: 0, duplicateCount: 0 });
    expect(imported.fixture.cases[0]).toMatchObject({
      originalTitle: "NVDA revenue rises 20%",
      originalSummary: "Quarterly revenue increased after management raised its annual outlook.",
      translatedTitle: "엔비디아(NVDA) 매출 20% 증가",
      expectedTitle: "엔비디아(NVDA) 매출 20% 증가",
      externalId: "nasdaq-NVDA-2026-09-25",
      ticker: "NVDA",
    });
  });

  it("imports approved and corrected translations, while excluding held rows", () => {
    const result = buildTranslationReviewFixture(csv([
      row("정확"),
      row("부분번역", "엔비디아(NVDA) 매출이 20% 증가했습니다.", { originalTitle: "NVDA revenue rises 20% quarter over quarter", translatedTitle: "엔비디아(NVDA) 매출 20% 증가" }),
      row("보류", "", { originalTitle: "TSLA headline pending", link: "" }),
    ]));

    expect(result).toMatchObject({ importedCount: 2, heldCount: 1, duplicateCount: 0 });
    expect(result.fixture.cases.map((entry) => entry.expectedTitle)).toEqual([
      "엔비디아(NVDA) 매출 20% 증가",
      "엔비디아(NVDA) 매출이 20% 증가했습니다.",
    ]);
  });

  it("is idempotent for an identical review row and rejects conflicting review edits", () => {
    const reviewCsv = csv([row("정확")]);
    const first = buildTranslationReviewFixture(reviewCsv);
    const second = buildTranslationReviewFixture(reviewCsv, first.fixture as TranslationReviewFixture);

    expect(second.importedCount).toBe(0);
    expect(second.duplicateCount).toBe(1);
    expect(() => buildTranslationReviewFixture(csv([row("오역", "엔비디아(NVDA) 매출이 20% 감소했습니다.")]), first.fixture as TranslationReviewFixture))
      .toThrow(/충돌합니다/);
  });

  it("deduplicates identical rows within one CSV and rejects contradictory review verdicts", () => {
    const duplicate = buildTranslationReviewFixture(csv([row("정확"), row("정확")]));
    expect(duplicate).toMatchObject({ importedCount: 1, duplicateCount: 1 });
    expect(duplicate.fixture.cases).toHaveLength(1);

    expect(() => buildTranslationReviewFixture(csv([
      row("정확"),
      row("오역", "엔비디아(NVDA) 매출이 20% 감소했습니다."),
    ]))).toThrow(/충돌합니다/);
  });

  it("rejects unsupported labels, missing corrections, unsafe formulas, and invalid URLs", () => {
    expect(() => buildTranslationReviewFixture(csv([row("좋음")]))).toThrow(/정확\/자동검사 오탐 확인\/부분번역\/오역\/보류/);
    expect(() => buildTranslationReviewFixture(csv([row("오역")]))).toThrow(/수정 번역/);
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { translatedTitle: "=HYPERLINK(\"https://bad.example\")" })]))).toThrow(/수식 prefix/);
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { link: "javascript:alert(1)" })]))).toThrow(/HTTP\(S\)/);
    expect(() => buildTranslationReviewFixture(csv([row("오역", "엔비디아 매출이 증가했습니다.")]))).toThrow(/숫자\/티커.*정확히 보존/);
    expect(() => buildTranslationReviewFixture(csv([row("오역", "엔비디아(NVDA) 매출 20% 증가")]))).toThrow(/기존 번역과 달라야/);
  });

  it("requires publication time, a source URL, and a review note that records evidence comparison", () => {
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { publishedAt: " " })])))
      .toThrow(/발행 시각이 없거나/);
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { link: "" })])))
      .toThrow(/기사 URL이 필요/);
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { notes: "" })])))
      .toThrow(/검수 메모에 원문\/요약\/기사 URL과 대조한 근거/);
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", { notes: "좋음", link: "https://example.com/review" })])))
      .toThrow(/검수 메모에 원문\/요약\/기사 URL과 대조한 근거/);
    expect(buildTranslationReviewFixture(csv([row("정확", "", { externalId: "", notes: "원문 요약과 링크 대조 확인" })])).fixture.cases)
      .toHaveLength(1);
  });

  it("rejects human-approved fixture titles that the production language or completeness gate would fallback", () => {
    expect(() => buildTranslationReviewFixture(csv([row("정확", "", {
      originalTitle: "Nvidia revenue rises sharply after earnings",
      translatedTitle: "Nvidia revenue rises sharply after earnings",
    })]))).toThrow(/한국어 판정을 통과하지 못합니다/);

    expect(() => buildTranslationReviewFixture(csv([row("부분번역", "매출 상승", {
      originalTitle: "Nvidia revenue growth outlook improves after quarterly earnings",
      translatedTitle: "엔비디아 분기 실적 발표 후 매출 성장 전망 개선",
    })]))).toThrow(/불완전한 번역으로 판정됩니다/);
  });

  it("does not accept whitespace-only or canonically equivalent text as a translation correction", () => {
    const translatedTitle = "엔비디아(NVDA) 매출 20% 증가";
    expect(() => buildTranslationReviewFixture(csv([row("부분번역", "엔비디아(NVDA)  매출 20% 증가", { translatedTitle })])))
      .toThrow(/기존 번역과 달라야/);
    expect(() => buildTranslationReviewFixture(csv([row("오역", "엔비디아(NVDA) 매출 20% 증가", { translatedTitle })])))
      .toThrow(/기존 번역과 달라야/);

    const accurate = buildTranslationReviewFixture(csv([row("정확", "엔비디아(NVDA)  매출 20% 증가", { translatedTitle })]));
    expect(accurate.fixture.cases[0].expectedTitle).toBe(translatedTitle);
  });

  it("accepts decomposed Korean corrections and stores them in NFC like provider translations", () => {
    const decomposedCorrection = "엔비디아(NVDA) 매출이 20% 증가했습니다.";
    const result = buildTranslationReviewFixture(csv([row("부분번역", decomposedCorrection, { translatedTitle: "엔비디아(NVDA) 매출 20% 증가" })]));

    expect(result.fixture.cases[0].translatedTitle).toBe("엔비디아(NVDA) 매출 20% 증가");
    expect(result.fixture.cases[0].expectedTitle).toBe("엔비디아(NVDA) 매출이 20% 증가했습니다.");
  });

  it("requires corrections to preserve full financial tokens, including currency units and quarters", () => {
    const originalTitle = "NVDA revenue rises $2.5B in Q3, up 18% year over year";
    expect(() => buildTranslationReviewFixture(csv([row("부분번역", "엔비디아 매출 2.5 증가 3분기 18 증가", { originalTitle })])))
      .toThrow(/숫자\/티커.*정확히 보존/);
    expect(buildTranslationReviewFixture(csv([row("부분번역", "엔비디아(NVDA) 매출 $2.5B Q3 18% 증가", { originalTitle })])).fixture.cases)
      .toHaveLength(1);
  });

  it("preserves repeated source token counts and rejects unsupported added numbers or tickers", () => {
    const repeatedTitle = "NVDA revenue rose 20% in Q3 after another 20% increase";
    const validCorrection = "엔비디아(NVDA) Q3 매출이 20% 상승했고 다시 20% 증가했습니다.";
    expect(buildTranslationReviewFixture(csv([row("부분번역", validCorrection, { originalTitle: repeatedTitle, translatedTitle: "엔비디아(NVDA) Q3 매출 20% 증가" })])).fixture.cases)
      .toHaveLength(1);

    expect(() => buildTranslationReviewFixture(csv([row("부분번역", `${validCorrection} 50%`, { originalTitle: repeatedTitle, translatedTitle: "엔비디아(NVDA) Q3 매출 20% 증가" })])))
      .toThrow(/원문에 없는 숫자\/티커/);
    expect(() => buildTranslationReviewFixture(csv([row("부분번역", validCorrection.replace("(NVDA)", "(TSLA)(NVDA)"), { originalTitle: repeatedTitle, translatedTitle: "엔비디아(NVDA) Q3 매출 20% 증가" })])))
      .toThrow(/원문에 없는 숫자\/티커/);

    const missingOneRepeatedValue = "엔비디아(NVDA) Q3 매출이 20% 상승했습니다.";
    expect(() => buildTranslationReviewFixture(csv([row("부분번역", missingOneRepeatedValue, { originalTitle: repeatedTitle, translatedTitle: "엔비디아(NVDA) Q3 매출 20% 증가" })])))
      .toThrow(/출현 횟수 2회를 정확히 보존/);
  });

  it("restores the exporter's safe formula prefix as literal source text", () => {
    const result = buildTranslationReviewFixture(csv([row("정확", "", { originalTitle: "'=HYPERLINK(\"https://example.com\")", translatedTitle: "HYPERLINK 링크 관련 제목" })]));
    expect(result.fixture.cases[0].originalTitle).toBe("=HYPERLINK(\"https://example.com\")");
  });

  it("requires the exact exporter header and consistent row width", () => {
    expect(() => parseTranslationReviewCsv(csv([row("정확")]).replace("번역 제목", "다른 열"))).toThrow(/헤더/);
    expect(() => parseTranslationReviewCsv(`${csv([])}\r\n"정확","원문"`)).toThrow(/열 개수/);
  });

  it("imports the prior CSV format and keys new review cases by stable source externalId", () => {
    const previousCurrentCsv = `\uFEFF${[previousCurrentHeader, row("정확")].map((values) => values.map(quote).join(",")).join("\r\n")}`;
    expect(buildTranslationReviewFixture(previousCurrentCsv).fixture.cases).toHaveLength(1);

    const previousRow = row("정확").filter((_value, index) => index !== 2);
    const previousCsv = `\uFEFF${[previousHeader, previousRow].map((values) => values.map(quote).join(",")).join("\r\n")}`;
    const previous = buildTranslationReviewFixture(previousCsv);
    expect(previous.fixture.cases[0]).toMatchObject({ originalSummary: null, externalId: "nasdaq-NVDA revenue rises 20%" });

    const legacyRow = row("정확").filter((_value, index) => index !== 6 && index !== 2);
    const legacyCsv = `\uFEFF${[legacyHeader, legacyRow].map((values) => values.map(quote).join(",")).join("\r\n")}`;
    const legacy = buildTranslationReviewFixture(legacyCsv);
    expect(legacy.fixture.cases[0]).toMatchObject({ externalId: null });
    const upgraded = buildTranslationReviewFixture(csv([row("정확")]), legacy.fixture as TranslationReviewFixture);
    expect(upgraded).toMatchObject({ importedCount: 0, duplicateCount: 1 });
    expect(upgraded.fixture.cases).toHaveLength(1);
    expect(upgraded.fixture.cases[0].externalId).toBe("nasdaq-NVDA revenue rises 20%");
    expect(upgraded.fixture.cases[0].originalSummary).toBe("Quarterly revenue increased after management raised its annual outlook.");

    const first = buildTranslationReviewFixture(csv([row("정확")]));
    const updatedArticle = row("정확", "", {
      originalTitle: "Updated title for the same feed item",
      translatedTitle: "같은 피드 항목의 제목이 변경됐습니다",
      link: "https://example.com/updated",
      externalId: "nasdaq-NVDA revenue rises 20%",
    });
    expect(() => buildTranslationReviewFixture(csv([updatedArticle]), first.fixture as TranslationReviewFixture))
      .toThrow(/충돌합니다/);
  });

  it("restores Excel-safe wrappers without losing leading zeroes or timestamp precision", () => {
    const result = buildTranslationReviewFixture(csv([row("정확", "", {
      externalId: "RSS-ID:0000123",
      ticker: "RSS-TICKER:005930",
      publishedAt: "RSS-TIME:2026-09-25T01:02:03.456Z",
    })]));

    expect(result.fixture.cases[0]).toMatchObject({
      externalId: "0000123",
      ticker: "005930",
      publishedAt: "2026-09-25T01:02:03.456Z",
    });
  });

  it("preserves source summary as human review evidence without changing the corrected headline", () => {
    const summary = "Management raised full-year guidance while noting demand remains uncertain.";
    const result = buildTranslationReviewFixture(csv([row("정확", "", { summary })]));
    expect(result.fixture.cases[0]).toMatchObject({ originalSummary: summary, expectedTitle: "엔비디아(NVDA) 매출 20% 증가" });
  });

  it("preserves a reviewer memo, including the missing-context reminder, in the regression fixture", () => {
    const note = "원문 요약 없음 · 원문 링크에서 맥락 확인; 계약 조건은 원문에서 확인함";
    const result = buildTranslationReviewFixture(csv([row("정확", "", { summary: "", notes: note })]));

    expect(result.fixture.cases[0].notes).toBe(note);
  });

  it("leaves fixture bytes untouched in preview mode", async () => {
    const files = await makeTemporaryFiles(csv([row("정확")]));
    const before = await readFile(files.fixturePath, "utf8");

    const result = await importTranslationReviewCsvFile({ inputPath: files.inputPath, fixturePath: files.fixturePath });

    expect(result.mode).toBe("preview");
    expect(result.importedCount).toBe(1);
    expect(await readFile(files.fixturePath, "utf8")).toBe(before);
    expect(await readdir(files.directory)).toEqual(["fixture.json", "review.csv"]);
  });

  it("checks preview duplicates and conflicts against the existing fixture without applying changes", async () => {
    const existing = buildTranslationReviewFixture(csv([row("정확")])).fixture;
    const duplicateFiles = await makeTemporaryFiles(csv([row("정확")]), existing);
    const before = await readFile(duplicateFiles.fixturePath, "utf8");

    const preview = await importTranslationReviewCsvFile({ inputPath: duplicateFiles.inputPath, fixturePath: duplicateFiles.fixturePath });

    expect(preview).toMatchObject({ mode: "preview", importedCount: 0, duplicateCount: 1 });
    expect(await readFile(duplicateFiles.fixturePath, "utf8")).toBe(before);

    const conflictFiles = await makeTemporaryFiles(csv([row("오역", "엔비디아(NVDA) 매출이 20% 감소했습니다.")]), existing);
    const conflictBefore = await readFile(conflictFiles.fixturePath, "utf8");
    await expect(importTranslationReviewCsvFile({ inputPath: conflictFiles.inputPath, fixturePath: conflictFiles.fixturePath }))
      .rejects.toThrow(/충돌합니다/);
    expect(await readFile(conflictFiles.fixturePath, "utf8")).toBe(conflictBefore);
  });

  it("applies atomically, preserves prior cases, and is idempotent", async () => {
    const existing = buildTranslationReviewFixture(csv([row("정확", "", { originalTitle: "AAPL revenue rises 10%", translatedTitle: "AAPL 매출 10% 증가", ticker: "AAPL" })])).fixture;
    const nextRow = row("정확", "", { originalTitle: "MSFT revenue rises 5%", translatedTitle: "MSFT 매출 5% 증가", ticker: "MSFT", link: "https://example.com/msft" });
    const files = await makeTemporaryFiles(csv([nextRow]), existing);

    const applied = await importTranslationReviewCsvFile({ inputPath: files.inputPath, fixturePath: files.fixturePath, apply: true });
    const persisted = JSON.parse(await readFile(files.fixturePath, "utf8"));
    const reapplied = await importTranslationReviewCsvFile({ inputPath: files.inputPath, fixturePath: files.fixturePath, apply: true });

    expect(applied).toMatchObject({ mode: "applied", importedCount: 1 });
    expect(persisted.cases).toHaveLength(2);
    expect(reapplied).toMatchObject({ mode: "applied", importedCount: 0, duplicateCount: 1 });
    expect(JSON.parse(await readFile(files.fixturePath, "utf8")).cases).toHaveLength(2);
    expect((await readdir(files.directory)).sort()).toEqual(["fixture.json", "review.csv"]);
  });

  it("does not mutate fixture or leave a temp file when CSV validation fails", async () => {
    const files = await makeTemporaryFiles(csv([row("정확")]));
    const before = await readFile(files.fixturePath, "utf8");
    await writeFile(files.inputPath, csv([row("오역")]), "utf8");

    await expect(importTranslationReviewCsvFile({ inputPath: files.inputPath, fixturePath: files.fixturePath, apply: true }))
      .rejects.toThrow(/수정 번역/);
    expect(await readFile(files.fixturePath, "utf8")).toBe(before);
    expect(await readdir(files.directory)).toEqual(["fixture.json", "review.csv"]);
  });

  it("preserves the original fixture and cleans its temp file when atomic rename fails", async () => {
    const files = await makeTemporaryFiles(csv([row("정확")]));
    const before = await readFile(files.fixturePath, "utf8");
    const io = {
      writeFile,
      rename: async () => { throw new Error("simulated rename failure"); },
      unlink,
    };

    await expect(writeFixtureAtomically(files.fixturePath, { schemaVersion: 1, cases: [] }, io)).rejects.toThrow("simulated rename failure");
    expect(await readFile(files.fixturePath, "utf8")).toBe(before);
    expect(await readdir(files.directory)).toEqual(["fixture.json", "review.csv"]);
  });
});
