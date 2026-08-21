import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentUniverseSyncRuns, krInstrumentUniverse, usInstrumentUniverse } from "@/lib/schema";

type KrRow = { market: "KOSPI" | "KOSDAQ"; code: string; standardCode: string; name: string; securityGroupCode: string; marketCapScale: string; industryLargeCode: string; industryMediumCode: string; industrySmallCode: string; etpProductClassCode: string; preferredClassCode: string; tradingHaltCode: string; liquidationCode: string; managedIssueCode: string; sourceFile: string; rawPayload: string };
type UsRow = { market: "NAS" | "NYS" | "AMS"; code: string; realtimeSymbol: string; name: string; englishName: string; securityType: string; etpType: string; currency: string; countryCode: string; industryCode: string; isEtf: boolean; isWarrant: boolean; isDerivative: boolean; isDr: boolean; sourceFile: string; rawPayload: string };

const KIS_DECODER = new TextDecoder("euc-kr");
function decode(bytes: Buffer) { return KIS_DECODER.decode(bytes); }
function clean(value: string | undefined) { return (value ?? "").replace(/\0/g, "").trim(); }
function bool(value: string) { return value.toUpperCase() === "Y"; }

export function parseDomestic(buffer: Buffer, market: "KOSPI" | "KOSDAQ", sourceFile: string): KrRow[] {
  // The domestic master is a byte-offset fixed-width file.  Applying the
  // offsets after decoding CP949 is incorrect because Korean characters are
  // two bytes but one JavaScript character; that shifted the security-group
  // field (for example BC/EF) and let ETPs through as COMMON_STOCK.
  return buffer.toString("binary").split("\n").map((line) => Buffer.from(line.replace(/\r$/, ""), "binary")).filter((line) => line.length > 0).map((line) => {
    const kospi = market === "KOSPI";
    const field = (offset: number, length: number) => clean(decode(line.subarray(offset, offset + length)));
    const one = (offset: number) => field(offset, 1);
    // Offsets follow KIS Developers' official 종목마스터정보(코스피/코스닥).h.
    const common = { market, code: field(0, 6), standardCode: field(9, 12), name: field(21, 40), securityGroupCode: field(61, 2), marketCapScale: one(63), industryLargeCode: field(64, 4), industryMediumCode: field(68, 4), industrySmallCode: field(72, 4), sourceFile, rawPayload: decode(line) };
    const etp = one(kospi ? 84 : 80);
    const halt = one(kospi ? 118 : 113);
    const liquidation = one(kospi ? 119 : 114);
    const managed = one(kospi ? 120 : 115);
    const preferred = one(kospi ? 216 : 211);
    return { ...common, etpProductClassCode: etp, preferredClassCode: preferred, tradingHaltCode: halt, liquidationCode: liquidation, managedIssueCode: managed };
  }).filter((row) => row.code.length === 6);
}

export function parseOverseas(buffer: Buffer, market: "NAS" | "NYS" | "AMS", sourceFile: string): UsRow[] {
  return decode(buffer).split(/\r?\n/).map((raw) => raw.replace(/\r$/, "")).filter(Boolean).map((raw) => {
    const f = raw.split("\t").map(clean);
    const securityType = f[8] ?? ""; const etpType = f[24] ?? "";
    return { market, code: f[4] ?? "", realtimeSymbol: f[5] ?? "", name: f[6] ?? "", englishName: f[7] ?? "", securityType, etpType, currency: f[9] ?? "", countryCode: f[0] ?? "", industryCode: f[23] ?? "", isEtf: securityType === "3" || ["001", "005"].includes(etpType), isWarrant: securityType === "4", isDerivative: securityType === "4" || ["002", "003", "006"].includes(etpType), isDr: bool(f[20] ?? ""), sourceFile, rawPayload: raw };
  }).filter((row) => row.code.length > 0);
}

export function classifyKr(row: KrRow) {
  const isEtp = ["EF", "FE"].includes(row.securityGroupCode) || ["1", "2", "3", "4", "5"].includes(row.etpProductClassCode);
  const isWarrant = ["EW", "SW", "SR"].includes(row.securityGroupCode);
  // KIS exposes SPACs and some preferred/convertible shares as ST (stock) in
  // the security-group field. Their official master name is the remaining
  // authoritative product descriptor, so exclude these names from the
  // COMMON_STOCK universe rather than allowing them into daily scanners.
  const preferredName = /(?:우선주|우(?:\(|$)|\d우B(?:\(|$))/i.test(row.name);
  const spacName = /(?:스팩|SPAC)/i.test(row.name);
  const convertibleName = /(?:전환|신주인수권|권리주)/i.test(row.name);
  const isPreferred = ["1", "2"].includes(row.preferredClassCode) || preferredName;
  const excluded = isEtp || isWarrant || spacName || convertibleName || ["BC", "MF", "RT", "SC", "IF"].includes(row.securityGroupCode) || isPreferred;
  // `managedIssueCode` is the official 관리종목 flag, not a trading halt.
  // It must remain available for diagnostics but must not exclude a stock
  // from daily candles. Only the official 거래정지/청산 flags suspend data.
  return { instrumentType: excluded ? "EXCLUDED_PRODUCT" : row.securityGroupCode === "DR" ? "DR" : "COMMON_STOCK", isEtp, isWarrant, isPreferred, isSuspended: ["Y", "1"].includes(row.tradingHaltCode) || ["Y", "1"].includes(row.liquidationCode) };
}

export async function importInstrumentMasters(sourceDirectory: string) {
  const startedAt = new Date(); const db = getDb();
  const run = await db.insert(instrumentUniverseSyncRuns).values({ scope: "KR_DOMESTIC_US_OVERSEAS", sourceDirectory, status: "PROCESSING", startedAt }).returning({ id: instrumentUniverseSyncRuns.id });
  const runId = run[0]?.id;
  try {
    const files: Array<{ name: string; kind: "KR" | "US"; market: KrRow["market"] | UsRow["market"] }> = [
      { name: "kospi_code.mst", kind: "KR", market: "KOSPI" }, { name: "kosdaq_code.mst", kind: "KR", market: "KOSDAQ" },
      { name: "NASMST.COD", kind: "US", market: "NAS" }, { name: "NYSMST.COD", kind: "US", market: "NYS" }, { name: "AMSMST.COD", kind: "US", market: "AMS" },
    ];
    const krRows: KrRow[] = []; const usRows: UsRow[] = []; const missing: string[] = [];
    for (const file of files) { try { const bytes = await readFile(path.join(sourceDirectory, file.name)); if (file.kind === "KR") krRows.push(...parseDomestic(bytes, file.market as KrRow["market"], file.name)); else usRows.push(...parseOverseas(bytes, file.market as UsRow["market"], file.name)); } catch { missing.push(file.name); } }
    if (missing.length || krRows.length + usRows.length === 0) throw new Error(`MASTER_FILE_MISSING:${missing.join(",") || "EMPTY"}`);
    const now = new Date(); let saved = 0;
    // 원본 마스터에는 같은 시장·코드가 반복될 수 있습니다. PostgreSQL의
    // ON CONFLICT UPDATE는 한 INSERT 안에서 같은 대상 행을 두 번 갱신할 수
    // 없으므로, 배치 전에 키 기준으로 마지막 레코드만 남깁니다.
    const uniqueKrRows = [...new Map(krRows.map((row) => [`${row.market}:${row.code}`, row])).values()];
    const uniqueUsRows = [...new Map(usRows.map((row) => [`${row.market}:${row.code}`, row])).values()];
    for (let offset = 0; offset < uniqueKrRows.length; offset += 250) { const rows = uniqueKrRows.slice(offset, offset + 250).map((row) => ({ ...row, ...classifyKr(row), enabled: true, lastSeenAt: now, updatedAt: now })); await db.insert(krInstrumentUniverse).values(rows).onConflictDoUpdate({ target: [krInstrumentUniverse.market, krInstrumentUniverse.code], set: { standardCode: sql`excluded.standard_code`, name: sql`excluded.name`, instrumentType: sql`excluded.instrument_type`, securityGroupCode: sql`excluded.security_group_code`, marketCapScale: sql`excluded.market_cap_scale`, industryLargeCode: sql`excluded.industry_large_code`, industryMediumCode: sql`excluded.industry_medium_code`, industrySmallCode: sql`excluded.industry_small_code`, etpProductClassCode: sql`excluded.etp_product_class_code`, preferredClassCode: sql`excluded.preferred_class_code`, tradingHaltCode: sql`excluded.trading_halt_code`, liquidationCode: sql`excluded.liquidation_code`, managedIssueCode: sql`excluded.managed_issue_code`, isEtp: sql`excluded.is_etp`, isWarrant: sql`excluded.is_warrant`, isPreferred: sql`excluded.is_preferred`, isSuspended: sql`excluded.is_suspended`, enabled: true, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); saved += rows.length; }
    for (let offset = 0; offset < uniqueUsRows.length; offset += 250) { const rows = uniqueUsRows.slice(offset, offset + 250).map((row) => ({ ...row, instrumentType: row.isWarrant || row.isDerivative ? "DERIVATIVE" : row.isEtf ? "ETF" : row.isDr ? "DR" : "COMMON_STOCK", enabled: true, lastSeenAt: now, updatedAt: now })); await db.insert(usInstrumentUniverse).values(rows).onConflictDoUpdate({ target: [usInstrumentUniverse.market, usInstrumentUniverse.code], set: { realtimeSymbol: sql`excluded.realtime_symbol`, name: sql`excluded.name`, englishName: sql`excluded.english_name`, instrumentType: sql`excluded.instrument_type`, etpType: sql`excluded.etp_type`, securityType: sql`excluded.security_type`, currency: sql`excluded.currency`, isEtf: sql`excluded.is_etf`, isWarrant: sql`excluded.is_warrant`, isDerivative: sql`excluded.is_derivative`, isDr: sql`excluded.is_dr`, enabled: true, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); saved += rows.length; }
    await db.update(instrumentUniverseSyncRuns).set({ status: "COMPLETED", sourceCount: saved, insertedCount: saved, completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId));
    return { ok: true, runId, sourceCount: saved, domesticCount: krRows.length, overseasCount: usRows.length, files, missingFiles: [] };
  } catch (error) { await db.update(instrumentUniverseSyncRuns).set({ status: "FAILED", errorCount: 1, errorSummary: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId)); throw error; }
}
