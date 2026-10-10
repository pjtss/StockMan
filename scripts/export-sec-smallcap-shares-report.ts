import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";
import { loadSecReviewOverrides } from "../lib/sec-smallcap-review-overrides";
import { loadLocalEnv } from "./local-env.mjs";

loadLocalEnv({ required: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const database = new URL(databaseUrl);
if (!["localhost", "127.0.0.1", "::1"].includes(database.hostname)) throw new Error(`Refusing non-local database host: ${database.hostname}`);
const pool = new pg.Pool({ connectionString: databaseUrl });
const outputPath = resolve(process.cwd(), "docs/operations/us-smallcap-sec-shares.md");
const reviewReportPath = resolve(process.cwd(), "docs/operations/us-smallcap-sec-shares-review-input.md");

function formatKst(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "medium", hour12: false }).format(date);
}
function escapeCell(value: unknown) { return String(value ?? "").replaceAll("|", "\\|").replace(/[\r\n]+/g, " "); }
function formatManUsd(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? (number / 10_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "";
}
function formatShares(value: unknown) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) return "";
  if (number >= 100_000_000) return `${(number / 100_000_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}억 주 (${number.toLocaleString("ko-KR")}주)`;
  if (number >= 10_000) return `${(number / 10_000).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}만 주 (${number.toLocaleString("ko-KR")}주)`;
  return `${number.toLocaleString("ko-KR")}주`;
}

async function main() {
  try {
    const fetchDirectory = async (url: string) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new Error(`Official listing directory failed (${url}): HTTP ${response.status}`);
      return response.text();
    };
    const [nasdaqText, otherText] = await Promise.all([
      fetchDirectory("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
      fetchDirectory("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
    ]);
    const parseDirectory = (source: string) => {
      const [headerLine = "", ...lines] = source.trim().split(/\r?\n/);
      const headers = headerLine.split("|");
      const rows = lines.filter((line) => line.includes("|")).map((line) => Object.fromEntries(line.split("|").map((value, index) => [headers[index], value])));
      return { headers, rows };
    };
    const nasdaqDirectory = parseDirectory(nasdaqText);
    const otherDirectory = parseDirectory(otherText);
    const canonicalTicker = (ticker: string) => ticker.trim().toUpperCase().replaceAll(".", "/");
    const currentListings = new Map<string, { securityName: string; financialStatus: string }>();
    const otherExchangeName = (code: string) => code === "N" ? "NYSE" : code === "A" ? "NYSE AMERICAN" : code === "P" ? "NYSE ARCA" : "";
    for (const entry of nasdaqDirectory.rows) {
      if (entry.Symbol && entry["Test Issue"] !== "Y") currentListings.set(`NASDAQ:${canonicalTicker(entry.Symbol)}`, { securityName: entry["Security Name"] || "", financialStatus: entry["Financial Status"] || "" });
    }
    for (const entry of otherDirectory.rows) {
      const exchange = otherExchangeName(entry.Exchange || "");
      if (exchange && entry["Test Issue"] !== "Y") currentListings.set(`${exchange}:${canonicalTicker(entry["ACT Symbol"] || entry["NASDAQ Symbol"] || "")}`, { securityName: entry["Security Name"] || "", financialStatus: "" });
    }
    const result = await pool.query(`
      SELECT u.market, UPPER(u.code) AS ticker, u.name,
             f.market_cap AS market_cap_usd, f.price AS price_usd, f.fetched_at AS market_cap_as_of,
             s.cik, s.company_name, s.dei_shares_outstanding AS shares_outstanding,
             s.dei_fact_end_date::text AS fact_end_date,
             s.dei_fact_filed_date::text AS fact_filed_date, s.dei_fact_accession_number AS fact_accession_number,
             s.source_url, s.fetched_at AS sec_fetched_at, s.updated_at AS sec_updated_at,
             r.review_status, r.shares_outstanding AS reviewed_shares_outstanding,
             r.as_of_date::text AS reviewed_as_of_date, r.filing_form AS reviewed_filing_form,
             r.filing_date::text AS reviewed_filing_date, r.source_url AS reviewed_source_url
        FROM us_common_stock_universe u
        JOIN instrument_fundamental_snapshots f USING (market, code)
        LEFT JOIN sec_smallcap_common_stock_shares s
          ON s.market = u.market AND s.ticker = UPPER(u.code)
        LEFT JOIN sec_smallcap_share_review r
          ON r.market = u.market AND r.ticker = UPPER(u.code)
       WHERE u.enabled = TRUE AND u.daily_active = TRUE
         AND u.instrument_type = 'COMMON_STOCK'
         AND COALESCE(u.is_etf, FALSE) = FALSE AND COALESCE(u.is_warrant, FALSE) = FALSE
         AND COALESCE(u.is_derivative, FALSE) = FALSE AND COALESCE(u.is_dr, FALSE) = FALSE
         AND COALESCE(u.is_leveraged, FALSE) = FALSE AND COALESCE(u.is_inverse, FALSE) = FALSE
         AND u.market IN ('NAS','NASDAQ','NYS','NYSE','AMS','AMEX')
         AND f.currency = 'USD' AND f.market_cap > 0 AND f.market_cap <= 100000000
    `);
    // Reproducible SEC review input is stored separately so report generation cannot overwrite it.
    const reviewOverrides = await loadSecReviewOverrides(reviewReportPath, 32);
    const dbConflicts: string[] = [];
    for (const row of result.rows as Array<Record<string, any>>) {
      const override = reviewOverrides.get(`${String(row.market).toUpperCase()}:${String(row.ticker).toUpperCase()}`);
      if (override) {
        if (row.review_status && (row.review_status !== override.review_status
          || String(row.reviewed_shares_outstanding ?? "") !== String(override.reviewed_shares_outstanding ?? "")
          || String(row.reviewed_as_of_date ?? "").slice(0, 10) !== String(override.reviewed_as_of_date ?? ""))) {
          dbConflicts.push(`${row.market}:${row.ticker}`);
        }
        Object.assign(row, override);
      }
    }
    const officialRows: Array<Record<string, any>> = (result.rows as Array<Record<string, any>>).flatMap((row): Array<Record<string, any>> => {
      const market = String(row.market).toUpperCase();
      const ticker = String(row.ticker).toUpperCase();
      const acceptedExchanges = market === "NAS" || market === "NASDAQ"
        ? ["NASDAQ"]
        : market === "NYS" || market === "NYSE" ? ["NYSE"] : ["NYSE AMERICAN"];
      const listing = acceptedExchanges.map((exchange) => ({ exchange, listing: currentListings.get(`${exchange}:${canonicalTicker(ticker)}`) })).find((item) => item.listing !== undefined)
        ?? [...currentListings.entries()].map(([key, listing]) => ({ exchange: key.slice(0, key.indexOf(":")), ticker: key.slice(key.indexOf(":") + 1), listing })).find((item) => item.ticker === canonicalTicker(ticker));
      return !listing ? [] : [{ ...row, listing_exchange: listing.exchange, listing_security_name: listing.listing!.securityName }];
    });
    const notCurrentlyListedRows = (result.rows as Array<Record<string, any>>).filter((row) => !officialRows.some((officialRow) => officialRow.market === row.market && officialRow.ticker === row.ticker));
    const excludedInstrumentPattern = /\b(?:american deposit(?:ary|ory)|deposit(?:ary|ory) shares?|deposit(?:ary|ory) receipts?|ads|adrs?|adw|preferred|warrant|units? of beneficial interest|units?|partnership units?|limited partnership interests?|operating partnership units?|certificates?|ctf|senior notes?|subordinated notes?|closed[ -]?end fund|royalty trust|etf|etn|etp|rights?)\b/i;
    // Foreign issuers may have ordinary/common underlying shares but the U.S. ticker itself can be an ADS/ADR. Exclude these receipts, plus funds, trusts, and non-common instruments.
    const secConfirmedNonCommonTickers = new Set(["QH", "IHT", "CFND", "PDCC", "CRT", "MTR", "PRT", "PVL", "VOC", "MARPS", "SGLD", "DAVA", "LRE", "MRM", "HERE", "NAAS", "NCTY", "NWGL", "QNRX", "TC", "PSNYW", "AMBO", "CANF", "COE", "DXF", "MYND", "RML"]);
    const isExplicitlyNonCommon = (row: Record<string, any>) => excludedInstrumentPattern.test(String(row.listing_security_name)) || excludedInstrumentPattern.test(String(row.name)) || /\b(?:ADR|ADS)\b/i.test(String(row.company_name)) || secConfirmedNonCommonTickers.has(String(row.ticker).toUpperCase());
    const excludedInstrumentRows = officialRows.filter(isExplicitlyNonCommon);
    const rows = officialRows.filter((row) => !isExplicitlyNonCommon(row));
    const generatedAt = new Date();
    const currentSharesCutoff = new Date(generatedAt);
    currentSharesCutoff.setFullYear(currentSharesCutoff.getFullYear() - 1);
    const isStaleVerified = (row: Record<string, any>) => row.review_status === "VERIFIED"
      && (!row.reviewed_as_of_date || new Date(`${row.reviewed_as_of_date}T00:00:00Z`) < currentSharesCutoff);
    rows.sort((a, b) => {
      const aShares = a.review_status === "VERIFIED" && !isStaleVerified(a) ? Number(a.reviewed_shares_outstanding) : Number.POSITIVE_INFINITY;
      const bShares = b.review_status === "VERIFIED" && !isStaleVerified(b) ? Number(b.reviewed_shares_outstanding) : Number.POSITIVE_INFINITY;
      return aShares - bShares || String(a.ticker).localeCompare(String(b.ticker)) || String(a.market).localeCompare(String(b.market));
    });
    const verifiedRows = rows.filter((row) => row.review_status === "VERIFIED" && row.reviewed_shares_outstanding != null);
    const staleVerifiedCount = verifiedRows.filter(isStaleVerified).length;
    const freshVerifiedRows = verifiedRows.filter((row) => !isStaleVerified(row));
    const underTenThousandCount = freshVerifiedRows.filter((row) => Number(row.reviewed_shares_outstanding) < 10_000).length;
    const underOneHundredThousandCount = freshVerifiedRows.filter((row) => Number(row.reviewed_shares_outstanding) < 100_000).length;
    const minimumFreshShares = freshVerifiedRows.length
      ? Math.min(...freshVerifiedRows.map((row) => Number(row.reviewed_shares_outstanding)))
      : null;
    const reviewRequiredCount = rows.filter((row) => row.review_status === "REVIEW_REQUIRED").length;
    const missingCount = rows.length - verifiedRows.length - reviewRequiredCount;
    const capDates = rows.map((row) => new Date(row.market_cap_as_of).getTime()).filter(Number.isFinite);
    const lines = [
      "# 미국 보통주 시가총액 1억 달러 이하 보고서",
      "",
      `- 생성 시각: ${formatKst(generatedAt)} KST (UTC ${generatedAt.toISOString()})`,
      `- 대상: Nasdaq Trader 공식 현재 NASDAQ·NYSE·NYSE American listing directory 등재를 확인한 활성 미국 COMMON_STOCK 중 USD 시가총액 0 초과·1억 달러 이하 (${rows.length.toLocaleString("en-US")}개)`,
      `- 공식 디렉터리 대조: 로컬 활성 COMMON_STOCK 시총 후보 ${(result.rows as Array<Record<string, any>>).length.toLocaleString("en-US")}개 중 현재 거래소·ticker 조합이 공식 디렉터리에 없는 ${notCurrentlyListedRows.length.toLocaleString("en-US")}개를 제외했다.${notCurrentlyListedRows.length ? ` 제외 ticker: ${notCurrentlyListedRows.map((row) => `${row.market}:${row.ticker}`).join(", ")}.` : ""}`,
      `- 비보통주 제외: 공식 거래소 listing name 및 SEC 등록 증권 종류에서 ADS/ADR(미국 ticker가 기초 보통주가 아닌 예탁증서를 나타내는 경우 포함), 우선주, 워런트, unit, 펀드, royalty trust, 채권, 증서, 권리 등으로 확인된 일반 보통주 외 ${excludedInstrumentRows.length.toLocaleString("en-US")}개를 제외했다. SEC 원문 확인으로 QH는 거래 대상이 아닌 기초 ordinary shares의 ADS, SGLD는 보통주 20주를 대표하는 ADS, CRT·MTR·PRT·PVL·VOC·MARPS는 trust units, IHT는 shares of beneficial interest, CFND·PDCC는 등록 펀드 지분임을 확인해 보통주 목록에서 제외했다.`,
      `- 시가총액 원천: 로컬 instrument_fundamental_snapshots USD 스냅샷 (갱신 범위: ${capDates.length ? `${new Date(Math.min(...capDates)).toISOString()} ~ ${new Date(Math.max(...capDates)).toISOString()}` : "없음"})`,
      `- 발행주식수: SEC 공시 원문에서 확인한 발행 보통주 전체 수량. 기준일 1년 이내 ${freshVerifiedRows.length.toLocaleString("en-US")}개, 기준일 1년 초과 ${staleVerifiedCount.toLocaleString("en-US")}개, 클래스/문맥 확인 필요 ${reviewRequiredCount.toLocaleString("en-US")}개, SEC 수량 미확보 ${missingCount.toLocaleString("en-US")}개. 기준일 1년 이내라는 표시는 원문 수량의 기준일만 나타내며 그 이후 자본 변동이 없음을 뜻하지 않는다. 각 표시값 옆에 SEC 수량 기준일을 함께 표기한다. 수량은 10,000주 이상부터 만 주, 100,000,000주 이상부터 억 주 단위로 표기하고 괄호 안에 정확한 주식 수를 병기한다. 10,000주 미만은 정확한 주식 수로 표기한다.`,
      `- 소량 수량 점검: 현재 기준일 1년 이내로 숫자 표시하는 ${freshVerifiedRows.length.toLocaleString("en-US")}개 중 최저는 ${minimumFreshShares?.toLocaleString("ko-KR") ?? "없음"}주이며, 100,000주 미만은 ${underOneHundredThousandCount.toLocaleString("en-US")}개 (10,000주 미만 ${underTenThousandCount.toLocaleString("en-US")}개)다. 이 집계는 현재 표시값만 대상으로 하며, 전체 SEC filing의 taxonomy/class context를 전수 재검토했다는 뜻은 아니다. 12주·100주처럼 한 클래스만 보고된 값은 발행사 전체 보통주 수량으로 채택하지 않고, 복수 클래스 합계를 확정할 수 없으면 숫자를 숨기고 \`검토 필요\`로 둔다. 발행사 전체 수량으로 검증된 70,000주는 \`7만 주 (70,000주)\`처럼 표시한다.`,
      "- 단위 예: 70,000주는 7만 주 (70,000주), 700,000주는 70만 주 (700,000주)로 표기한다. 만·억 단위 수량 뒤 괄호 안에는 반올림 없는 SEC 원주 수량을 병기한다.",
      "- 정렬: 기준일 1년 이내에 검증된 발행주식수 오름차순. 오래된 기준일·검토 필요·미확보는 뒤에 표시했다.",
      `- 상장 상태: [Nasdaq-listed directory](https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt)와 [other-exchange directory](https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt)를 조회해 Nasdaq·NYSE·NYSE American의 현재 등록 common-stock ticker만 포함했다. 디렉터리에서 빠진 종목은 상장 종료 공지 유무와 관계없이 보고서에서 제외한다. 2026-10-09 확인 시 제외 ticker 가운데 FSEA·NSTS·GETY·AMZE는 SEC Form 25에서 common stock 제거가 확인됐다. GWH Form 25는 warrant 제거를 대상으로 한다.`,
      "- SEC Company Facts의 `dei:EntityCommonStockSharesOutstanding`(cover-page fact)와 `us-gaap:CommonStockSharesOutstanding`(balance-sheet fact)는 각각 독립적으로 저장·대조한다. 둘 다 발행 보통주 잔존 수량(outstanding)이며 유통가능주식수(float)나 issued shares와 같지 않다. DEI는 표지의 최신 수량 후보로, GAAP은 재무제표 기준일 교차 확인용으로 사용하며 둘을 더하지 않는다. 두 값이 다르거나 없거나, 12주·100주처럼 전체 보통주 수량으로 의심되는 값이면 SEC 원문에서 클래스별 수량·기준일·split·후속 실제 발행을 확인한다. SEC Company Facts API는 전체 filing entity에 적용되는 표준 taxonomy fact를 모으므로 클래스 차원(discrete class axis) facts가 빠질 수 있다. 클래스 합계를 확정할 수 없으면 숫자를 숨기고 `검토 필요`로 둔다. 판정 근거는 `docs/operations/us-smallcap-sec-shares-review-input.md`와 로컬 DB에서 추적한다. 후속 공시 감사는 계속 진행 중이다.",
      "- 수량은 종목 ticker가 특정 클래스에 한정된 경우에도 발행사 전체 보통주 클래스 합계로 기록한다. UONE/UONEK는 A·B·C·D 전체 4,614,964주를 각 행에 표시한다.",
      "- 이 보고서에서 숫자로 표시한 수량은 SEC 원문 기준으로 검증된 값이며 발행주식수 기준일은 로컬 검토 기록에 남긴다. 기준일 1년 초과 수량은 갱신 전까지 `기준일 오래됨`으로, 전체 보통주 합계가 불명확하면 `검토 필요`, 원문 수량을 확인하지 못하면 `미확보`로 표시한다.",
      "- 복수 클래스 합산 참고 사례(아래는 각 SEC 공시의 기준일 수량이며 현재 표의 검증 상태를 대체하지 않는다): QNTM 2025-12-31 Class A 42주+Class B 3,887,729주=3,887,771주(388.78만 주), RFL 2026-06-09 Class A 787,163주+Class B 51,212,833주=51,999,996주(5200만 주), PAVS 2026-03-31 Class A 약 78,732주+Class B 약 321주=약 79,053주(약 7.91만 주; 이후 자본변동으로 현재 수량은 검토 필요). [SEC Company Facts 설명](https://www.sec.gov/edgar/sec-api-documentation) · [QNTM 2026년 20-F](https://www.sec.gov/Archives/edgar/data/1771885/000118518526001069/qntm20f123125.htm) · [RFL 2026년 10-Q](https://www.sec.gov/Archives/edgar/data/1713863/000121390026067560/ea0293312-10q_rafael.htm) · [PAVS 2026년 20-F](https://www.sec.gov/Archives/edgar/data/1751876/000192998026000454/pavs_20f.htm)",
      "",
      "| Ticker | 종목명 | 시가총액 (만 달러) | 발행주식수 (만·억 주; 괄호 안 정확한 주식 수) | SEC 수량 기준일 |",
      "|---|---|---:|---:|---|",
    ];
    let rank = 0;
    for (const row of rows) {
      const hasShares = row.review_status === "VERIFIED" && row.reviewed_shares_outstanding != null && !isStaleVerified(row);
      if (hasShares) rank += 1;
      const displayShares = hasShares ? formatShares(row.reviewed_shares_outstanding)
        : isStaleVerified(row) ? `기준일 오래됨 (${escapeCell(row.reviewed_as_of_date)})`
          : row.review_status === "REVIEW_REQUIRED" ? "검토 필요" : "미확보";
      const storedName = String(row.company_name || row.name || "");
      const listingName = String(row.listing_security_name || "");
      const companyName = /\bADS\b|\(ADR\)/i.test(storedName) && /\b(?:common stock|ordinary shares)\b/i.test(listingName) ? listingName : storedName;
      const sharesAsOf = hasShares ? escapeCell(row.reviewed_as_of_date) : "";
      lines.push(`| ${escapeCell(row.ticker)} | ${escapeCell(companyName)} | ${formatManUsd(row.market_cap_usd)} | ${displayShares} | ${sharesAsOf} |`);
    }
    lines.push("", "- `기준일 오래됨`은 SEC 근거가 있으나 기준일이 1년을 넘어 현재 숫자를 숨긴 상태다. `검토 필요`는 복수 클래스·병합 후 수량이나 후속 발행을 반영한 정확한 전체 수량을 확정하지 못한 상태다. `미확보`는 SEC 원문에서 발행사 전체 수량을 확인하지 못한 상태다. 이 상태들은 숫자를 표시하지 않는다. 검증 수량 열에는 SEC 수량 기준일을 함께 표시한다. 기준일은 해당 공시가 밝힌 수량의 날짜이며 그 뒤 자본 변동이 없음을 보장하지 않는다. 주식수는 10,000주 이상부터 만 주 단위, 100,000,000주 이상부터 억 주 단위로 표시하고 괄호 안에 정확한 주식 수를 병기한다.", "- 상장 존속 여부는 보고서 생성 시점의 Nasdaq Trader 공식 NASDAQ·NYSE·NYSE American 종목 디렉터리 등재로 판정한다. 해당 디렉터리에서 빠진 ticker는 SEC 상장폐지 공지 확인 여부와 관계없이 보고서에서 제외한다. 미등재 사실만으로 상장폐지 효력일이나 사유를 단정하지 않는다.", "- SEC 검토 근거는 `docs/operations/us-smallcap-sec-shares-review-input.md`와 로컬 `sec_smallcap_share_review`에 보존한다. 시가총액은 로컬 fundamental 스냅샷이다.", "- 문서 재생성: `node --import tsx scripts/export-sec-smallcap-shares-report.ts`", "");
    await mkdir(resolve(process.cwd(), "docs/operations"), { recursive: true });
    await writeFile(outputPath, `${lines.join("\n")}\n`, { encoding: "utf8" });
    console.info(JSON.stringify({ ok: true, outputPath, localCandidateCount: result.rows.length, currentlyListedCount: officialRows.length, nonCommonExcludedCount: excludedInstrumentRows.length, candidateCount: rows.length, notCurrentlyListed: notCurrentlyListedRows.map((row) => `${row.market}:${row.ticker}`), versionedReviewOverrideCount: reviewOverrides.size, dbConflicts, verifiedCount: verifiedRows.length, reviewRequiredCount, missingCount, generatedAt: generatedAt.toISOString() }));
  } finally {
    await pool.end();
  }
}

void main().catch((error) => {
  const errorCode = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  console.error(`[export-sec-smallcap-shares-report] ${error instanceof Error ? `${error.name}: ${error.message || errorCode || "no message"}` : String(error)}`);
  process.exitCode = 1;
});
