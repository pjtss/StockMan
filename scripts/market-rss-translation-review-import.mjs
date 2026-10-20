import { createHash, randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractMarketRssProtectedTokens } from "../lib/market-rss-translation-tokens.mjs";
import { decodeMarketRssReviewCell } from "../lib/market-rss-translation-review-cell-codec.mjs";
import { isMarketRssTranslationHeadlineComplete, isMarketRssTranslationKoreanEnough } from "../lib/market-rss-translation-quality.mjs";

const HEADERS = ["검수 판정(정확/자동검사 오탐 확인/부분번역/오역/보류)", "원문 제목", "원문 요약 (참고)", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const PREVIOUS_CURRENT_HEADERS = ["검수 판정(정확/부분번역/오역/보류)", "원문 제목", "원문 요약 (참고)", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const PREVIOUS_HEADERS = ["검수 판정(정확/부분번역/오역/보류)", "원문 제목", "번역 제목", "티커", "출처", "외부 기사 ID", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const LEGACY_HEADERS = ["검수 판정(정확/부분번역/오역/보류)", "원문 제목", "번역 제목", "티커", "출처", "발행 시각", "기사 URL", "수정 번역", "검수 메모"];
const VERDICTS = new Set(["정확", "자동검사 오탐 확인", "부분번역", "오역", "보류"]);
const FIXTURE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lib/fixtures/market-rss-translation-review.json");

export function parseTranslationReviewCsv(input) {
  const text = input.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
      continue;
    }
    if (closedQuote && char !== "," && char !== "\r" && char !== "\n") {
      throw new Error(`CSV 형식 오류: 닫힌 따옴표 뒤의 예상하지 못한 문자 (offset ${index})`);
    }
    if (char === '"') {
      if (field.length) throw new Error(`CSV 형식 오류: 필드 중간의 따옴표 (offset ${index})`);
      quoted = true;
    } else if (char === ",") {
      row.push(field); field = ""; closedQuote = false;
    } else if (char === "\r" || char === "\n") {
      row.push(field); field = ""; closedQuote = false;
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else {
      field += char;
    }
  }
  if (quoted) throw new Error("CSV 형식 오류: 닫히지 않은 따옴표");
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  if (!rows.length) throw new Error("CSV가 비어 있습니다.");
  const isCurrentFormat = rows[0].length === HEADERS.length && rows[0].every((value, index) => value === HEADERS[index]);
  const isPreviousCurrentFormat = rows[0].length === PREVIOUS_CURRENT_HEADERS.length && rows[0].every((value, index) => value === PREVIOUS_CURRENT_HEADERS[index]);
  const isPreviousFormat = rows[0].length === PREVIOUS_HEADERS.length && rows[0].every((value, index) => value === PREVIOUS_HEADERS[index]);
  const isLegacyFormat = rows[0].length === LEGACY_HEADERS.length && rows[0].every((value, index) => value === LEGACY_HEADERS[index]);
  if (!isCurrentFormat && !isPreviousCurrentFormat && !isPreviousFormat && !isLegacyFormat) {
    throw new Error("CSV 헤더가 관리자 RSS 번역 검수 양식과 일치하지 않습니다.");
  }
  for (const [index, values] of rows.slice(1).entries()) {
    const expectedWidth = isCurrentFormat || isPreviousCurrentFormat ? HEADERS.length : isPreviousFormat ? PREVIOUS_HEADERS.length : LEGACY_HEADERS.length;
    if (values.length !== expectedWidth) throw new Error(`CSV ${index + 2}행의 열 개수가 ${expectedWidth}개가 아닙니다.`);
  }
  return rows.slice(1).map((values) => {
    if (isCurrentFormat || isPreviousCurrentFormat) return values;
    if (isPreviousFormat) return [values[0], values[1], "", ...values.slice(2)];
    return [values[0], values[1], "", values[2], values[3], values[4], "", ...values.slice(5)];
  });
}

function unprotectSpreadsheetPrefix(value) {
  return value.replace(/^'(?=[\u0000-\u0020]*[=+\-@])/, "");
}

function assertSafeCell(value, rowNumber, label) {
  const safelyPrefixed = /^'[\u0000-\u0020]*[=+\-@]/.test(value);
  const restored = unprotectSpreadsheetPrefix(value);
  if (!safelyPrefixed && /^[\u0000-\u0020]*[=+\-@]/.test(restored)) {
    throw new Error(`CSV ${rowNumber}행 '${label}' 값에 안전하지 않은 스프레드시트 수식 prefix가 있습니다.`);
  }
  return restored.trim();
}

function stableId(source, originalTitle, link, externalId) {
  const identity = externalId ? `${source}\nexternal:${externalId}` : `${source}\n${originalTitle}\n${link}`;
  return createHash("sha256").update(identity).digest("hex").slice(0, 20);
}

function normalizeTitleForComparison(value) {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}

export function buildTranslationReviewFixture(input, existing = { schemaVersion: 1, cases: [] }) {
  if (existing?.schemaVersion !== 1 || !Array.isArray(existing.cases)) throw new Error("기존 fixture schemaVersion/cases 형식이 올바르지 않습니다.");
  const parsedRows = parseTranslationReviewCsv(input);
  const casesById = new Map(existing.cases.map((entry) => [entry.id, entry]));
  let heldCount = 0;
  let duplicateCount = 0;

  for (const [index, values] of parsedRows.entries()) {
    const rowNumber = index + 2;
    const [rawVerdict, rawOriginal, rawSummary, rawTranslated, rawTicker, rawSource, rawExternalId, rawPublishedAt, rawLink, rawCorrection, rawNotes] = values;
    const verdict = rawVerdict.trim();
    if (!VERDICTS.has(verdict)) throw new Error(`CSV ${rowNumber}행 판정은 정확/자동검사 오탐 확인/부분번역/오역/보류 중 하나여야 합니다.`);
    const originalTitle = assertSafeCell(rawOriginal, rowNumber, "원문 제목");
    const originalSummary = assertSafeCell(rawSummary, rowNumber, "원문 요약");
    const translatedTitle = assertSafeCell(rawTranslated, rowNumber, "번역 제목").normalize("NFC");
    const source = assertSafeCell(rawSource, rowNumber, "출처");
    const externalId = decodeMarketRssReviewCell("externalId", assertSafeCell(rawExternalId, rowNumber, "외부 기사 ID"));
    const ticker = decodeMarketRssReviewCell("ticker", assertSafeCell(rawTicker, rowNumber, "티커"));
    const publishedAt = decodeMarketRssReviewCell("publishedAt", assertSafeCell(rawPublishedAt, rowNumber, "발행 시각"));
    const link = assertSafeCell(rawLink, rowNumber, "기사 URL");
    const correction = assertSafeCell(rawCorrection, rowNumber, "수정 번역").normalize("NFC");
    const notes = assertSafeCell(rawNotes, rowNumber, "검수 메모");
    const isFallbackCandidate = notes.includes("RSS-REVIEW-CANDIDATE:incomplete")
      || notes.includes("RSS-REVIEW-CANDIDATE:target-language")
      || notes.includes("RSS-REVIEW-CANDIDATE:numeric-hallucination")
      || notes.includes("RSS-REVIEW-CANDIDATE:cache-invalidation");

    if (verdict === "보류") { heldCount++; continue; }
    if (isFallbackCandidate && verdict === "정확") {
      throw new Error(`CSV ${rowNumber}행은 자동 품질 검사에서 fallback된 후보입니다. 실제 수정이 필요하면 부분번역/오역을 선택하고, 자동검사 오탐임을 확인했으면 '자동검사 오탐 확인'을 선택하거나 근거가 부족하면 보류하세요.`);
    }
    if (verdict === "자동검사 오탐 확인" && !isFallbackCandidate) throw new Error(`CSV ${rowNumber}행은 자동 품질검사 후보 표식이 없어 '자동검사 오탐 확인'을 사용할 수 없습니다.`);
    if (!originalTitle || !translatedTitle || !source) throw new Error(`CSV ${rowNumber}행의 원문·번역·출처는 필수입니다.`);
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) throw new Error(`CSV ${rowNumber}행 발행 시각이 없거나 날짜로 해석할 수 없습니다.`);
    if (!link) throw new Error(`CSV ${rowNumber}행 기사 URL이 필요합니다.`);
    let parsedLink;
    try { parsedLink = new URL(link); } catch { throw new Error(`CSV ${rowNumber}행 기사 URL 형식이 올바르지 않습니다.`); }
    if (parsedLink.protocol !== "http:" && parsedLink.protocol !== "https:") throw new Error(`CSV ${rowNumber}행 기사 URL은 HTTP(S)만 허용합니다.`);
    const hasReviewEvidence = /(?:대조|확인|검수|비교|근거|원문|요약|기사|공시|실적|계약|오탐|수치|방향|문맥)/u.test(notes);
    if (!hasReviewEvidence) throw new Error(`CSV ${rowNumber}행 검수 메모에 원문/요약/기사 URL과 대조한 근거를 기록해야 합니다.`);

    let expectedTitle = translatedTitle;
    if (verdict === "정확" || verdict === "자동검사 오탐 확인") {
      if (correction && normalizeTitleForComparison(correction) !== normalizeTitleForComparison(translatedTitle)) throw new Error(`CSV ${rowNumber}행 '정확' 판정의 수정 번역은 비우거나 기존 번역과 같아야 합니다.`);
    } else {
      if (!correction || [...correction.matchAll(/[가-힣]/g)].length < 2) throw new Error(`CSV ${rowNumber}행 ${verdict} 판정에는 한글 2자 이상의 수정 번역이 필요합니다.`);
      if (normalizeTitleForComparison(correction) === normalizeTitleForComparison(translatedTitle)) throw new Error(`CSV ${rowNumber}행 ${verdict} 판정의 수정 번역은 검수한 기존 번역과 달라야 합니다.`);
      expectedTitle = correction;
    }
    const countTokens = (tokens) => tokens.reduce((counts, token) => counts.set(token, (counts.get(token) || 0) + 1), new Map());
    const sourceTokenCounts = countTokens(extractMarketRssProtectedTokens(originalTitle));
    const expectedTokenCounts = countTokens(extractMarketRssProtectedTokens(expectedTitle));
    for (const [token, sourceCount] of sourceTokenCounts) {
      if (expectedTokenCounts.get(token) !== sourceCount) {
        throw new Error(`CSV ${rowNumber}행 기대 번역에서 원문 숫자/티커 '${token}'의 출현 횟수 ${sourceCount}회를 정확히 보존해야 합니다.`);
      }
    }
    for (const token of expectedTokenCounts.keys()) {
      if (!sourceTokenCounts.has(token)) throw new Error(`CSV ${rowNumber}행 기대 번역에 원문에 없는 숫자/티커 '${token}'을 추가할 수 없습니다.`);
    }

    const protectedSource = extractMarketRssProtectedTokens(originalTitle);
    let qualitySource = originalTitle;
    let qualityExpected = expectedTitle;
    for (const [index, token] of protectedSource.entries()) {
      const marker = `ZX${index}Q`;
      qualitySource = qualitySource.replace(token, marker);
      qualityExpected = qualityExpected.replace(token, marker);
    }
    const sourceLettersToTranslate = /\p{L}/u.test(qualitySource.replace(/ZX\d+Q/g, "").replace(/[가-힣]/g, ""));
    if (sourceLettersToTranslate && !isMarketRssTranslationKoreanEnough(qualityExpected)) {
      throw new Error(`CSV ${rowNumber}행 기대 번역이 운영 기준의 한국어 판정을 통과하지 못합니다. 원문/수정 번역을 다시 확인하세요.`);
    }
    if (sourceLettersToTranslate && !isMarketRssTranslationHeadlineComplete(qualitySource, qualityExpected)) {
      throw new Error(`CSV ${rowNumber}행 기대 번역이 운영 기준에서 불완전한 번역으로 판정됩니다. 원문/수정 번역을 다시 확인하세요.`);
    }

    const id = stableId(source, originalTitle, link, externalId);
    const reviewCase = { id, source, externalId: externalId || null, originalTitle, originalSummary: originalSummary || null, translatedTitle, expectedTitle, verdict, ticker: ticker || null, publishedAt: publishedAt || null, link: link || null, notes: notes || null };
    let previousId = id;
    let previous = casesById.get(id);
    if (!previous && externalId) {
      const legacyCase = [...casesById.values()].find((entry) => entry.externalId == null
        && entry.source === source && entry.originalTitle === originalTitle && entry.link === (link || null));
      if (legacyCase) {
        previousId = legacyCase.id;
        previous = legacyCase;
      }
    }
    if (previous) {
      const previousContent = { ...previous };
      const reviewContent = { ...reviewCase };
      delete previousContent.id;
      delete previousContent.externalId;
      delete reviewContent.id;
      delete reviewContent.externalId;
      if (previousContent.originalSummary == null) previousContent.originalSummary = reviewContent.originalSummary ?? null;
      if (JSON.stringify(previousContent) !== JSON.stringify(reviewContent)) throw new Error(`CSV ${rowNumber}행이 기존 fixture ${previousId}와 충돌합니다. 원문·판정·수정 결과를 직접 비교하세요.`);
      if (previousId !== id) {
        casesById.delete(previousId);
        casesById.set(id, reviewCase);
      }
      duplicateCount++;
      continue;
    }
    casesById.set(id, reviewCase);
  }

  return {
    fixture: { schemaVersion: 1, cases: [...casesById.values()] },
    importedCount: casesById.size - existing.cases.length,
    heldCount,
    duplicateCount,
  };
}

export async function writeFixtureAtomically(fixturePath, fixture, io = { writeFile, rename, unlink }) {
  const temporaryPath = `${fixturePath}.${process.pid}.${randomUUID()}.tmp`;
  await io.writeFile(temporaryPath, `${JSON.stringify(fixture, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await io.rename(temporaryPath, fixturePath);
  } catch (error) {
    await io.unlink(temporaryPath).catch(() => {});
    throw error;
  }
}

export async function importTranslationReviewCsvFile({ inputPath, fixturePath = FIXTURE_PATH, apply = false }) {
  const csv = await readFile(inputPath, "utf8");
  const existing = JSON.parse(await readFile(fixturePath, "utf8"));
  const result = buildTranslationReviewFixture(csv, existing);
  if (apply) {
    await writeFixtureAtomically(fixturePath, result.fixture);
  }
  return {
    importedCount: result.importedCount,
    heldCount: result.heldCount,
    duplicateCount: result.duplicateCount,
    mode: apply ? "applied" : "preview",
    fixturePath,
    ...(apply ? {} : { fixture: result.fixture }),
  };
}

async function main(args) {
  const inputFlag = args.indexOf("--input");
  if (inputFlag < 0 || !args[inputFlag + 1]) throw new Error("사용법: node scripts/market-rss-translation-review-import.mjs --input <검수.csv> [--apply]");
  const apply = args.includes("--apply");
  const csvPath = path.resolve(inputFlag < 0 ? process.cwd() : args[inputFlag + 1]);
  const result = await importTranslationReviewCsvFile({ inputPath: csvPath, apply });
  process.stdout.write(`${JSON.stringify({ ...result, fixturePath: path.relative(process.cwd(), result.fixturePath) }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
