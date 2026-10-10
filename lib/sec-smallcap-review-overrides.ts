import { readFile } from "node:fs/promises";

export type SecReviewOverride = {
  market: string;
  ticker: string;
  review_status: "VERIFIED" | "REVIEW_REQUIRED" | "UNAVAILABLE";
  reviewed_shares_outstanding: number | null;
  reviewed_as_of_date: string | null;
  reviewed_filing_form: string;
  reviewed_filing_date: string;
  reviewed_source_url: string;
  reviewed_accession_number: string;
  review_note: string;
};

export function parseSecReviewOverrides(markdown: string, expectedCount?: number) {
  const section = markdown.match(/### 저수량 및 후속 공시 검토 기록\r?\n([\s\S]*?)(?:\r?\n## |$)/)?.[1] ?? "";
  const lines = section.split(/\r?\n/);
  const tableStart = lines.findIndex((line) => line.includes("| Market | Ticker | 판정 | 발행주식수 | 기준일 | SEC 양식·접수일 | SEC 원문 | 판정 근거 |"));
  const rows = tableStart < 0 ? [] : lines.slice(tableStart + 2).filter((line) => line.startsWith("| ") && line.split("|").length === 10);
  const overrides = new Map<string, SecReviewOverride>();
  for (const line of rows) {
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length !== 8) throw new Error(`Invalid SEC review row: ${line}`);
    const [market, ticker, statusText, sharesText, asOf, filingText, sourceUrl, note] = cells;
    const status = statusText as SecReviewOverride["review_status"];
    const filingMatch = filingText.match(/^(.+) · (\d{4}-\d{2}-\d{2})$/);
    const accession = sourceUrl.match(/\/data\/\d+\/(\d{18})\//)?.[1] ?? "";
    if (!market || !ticker || !["VERIFIED", "REVIEW_REQUIRED", "UNAVAILABLE"].includes(status)
      || !filingMatch || !/^https:\/\/www\.sec\.gov\/Archives\//.test(sourceUrl)
      || (status === "VERIFIED" && (!/^\d+$/.test(sharesText) || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)))
      || (status !== "VERIFIED" && (sharesText || asOf))) {
      throw new Error(`Invalid SEC review metadata for ${ticker || "unknown ticker"}`);
    }
    const key = `${market.toUpperCase()}:${ticker.toUpperCase()}`;
    if (overrides.has(key)) throw new Error(`Duplicate SEC review override: ${key}`);
    overrides.set(key, {
      market: market.toUpperCase(), ticker: ticker.toUpperCase(), review_status: status,
      reviewed_shares_outstanding: sharesText ? Number(sharesText) : null,
      reviewed_as_of_date: asOf || null, reviewed_filing_form: filingMatch[1], reviewed_filing_date: filingMatch[2],
      reviewed_source_url: sourceUrl, reviewed_accession_number: accession, review_note: note,
    });
  }
  if (expectedCount !== undefined && overrides.size !== expectedCount) {
    throw new Error(`Expected ${expectedCount} versioned SEC review rows, found ${overrides.size}`);
  }
  return overrides;
}

export async function loadSecReviewOverrides(path: string, expectedCount?: number) {
  return parseSecReviewOverrides(await readFile(path, "utf8"), expectedCount);
}
