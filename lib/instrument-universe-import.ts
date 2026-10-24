import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentUniverseSyncRuns, krCommonStockUniverse, krSpecialInstrumentUniverse, usCommonStockUniverse, usSpecialInstrumentUniverse } from "@/lib/schema";

type KrRow = { market: "KOSPI" | "KOSDAQ"; code: string; standardCode: string; name: string; securityGroupCode: string; marketCapScale: string; industryLargeCode: string; industryMediumCode: string; industrySmallCode: string; etpProductClassCode: string; preferredClassCode: string; tradingHaltCode: string; liquidationCode: string; managedIssueCode: string; sourceFile: string; rawPayload: string };
type UsRow = { market: "NAS" | "NYS" | "AMS"; code: string; realtimeSymbol: string; name: string; englishName: string; securityType: string; etpType: string; currency: string; countryCode: string; industryCode: string; isEtf: boolean; isLeveraged: boolean; isInverse: boolean; isWarrant: boolean; isDerivative: boolean; isDr: boolean; sourceFile: string; rawPayload: string };

const KIS_DECODER = new TextDecoder("euc-kr");
export const KR_MASTER_OFFSETS = {
  KOSPI: { etp: 83, halt: 121, liquidation: 122, managed: 123, preferred: 220 },
  KOSDAQ: { etp: 79, halt: 116, liquidation: 117, managed: 118, preferred: 215 },
} as const;
export const US_MASTER_FIELDS = {
  code: 4,
  realtimeSymbol: 5,
  name: 6,
  englishName: 7,
  securityType: 8,
  currency: 9,
  isDr: 17,
  industryCode: 19,
  etpType: 22,
} as const;
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
    const offsets = KR_MASTER_OFFSETS[market];
    const etp = one(offsets.etp);
    const halt = one(offsets.halt);
    const liquidation = one(offsets.liquidation);
    const managed = one(offsets.managed);
    const preferred = one(offsets.preferred);
    return { ...common, etpProductClassCode: etp, preferredClassCode: preferred, tradingHaltCode: halt, liquidationCode: liquidation, managedIssueCode: managed };
  }).filter((row) => row.code.length === 6);
}

export function parseOverseas(buffer: Buffer, market: "NAS" | "NYS" | "AMS", sourceFile: string): UsRow[] {
  return decode(buffer).split(/\r?\n/).map((raw) => raw.replace(/\r$/, "")).filter(Boolean).map((raw) => {
    const f = raw.split("\t").map(clean);
    const securityType = f[US_MASTER_FIELDS.securityType] ?? ""; const etpType = f[US_MASTER_FIELDS.etpType] ?? "";
    const isEtf = securityType === "3" || ["001", "005"].includes(etpType);
    const isWarrant = securityType === "4";
    const isDerivative = securityType === "4" || ["002", "003", "004", "006"].includes(etpType);
    return { market, code: f[US_MASTER_FIELDS.code] ?? "", realtimeSymbol: f[US_MASTER_FIELDS.realtimeSymbol] ?? "", name: f[US_MASTER_FIELDS.name] ?? "", englishName: f[US_MASTER_FIELDS.englishName] ?? "", securityType, etpType, currency: f[US_MASTER_FIELDS.currency] ?? "", countryCode: f[0] ?? "", industryCode: f[US_MASTER_FIELDS.industryCode] ?? "", isEtf, isLeveraged: false, isInverse: false, isWarrant, isDerivative, isDr: bool(f[US_MASTER_FIELDS.isDr] ?? ""), sourceFile, rawPayload: raw };
  }).filter((row) => row.code.length > 0);
}

export const INSTRUMENT_MASTER_MISSING_GRACE_RUNS = 2;
let instrumentMasterImportInProgress = false;

export function nextMissingMasterState(currentMissingRuns: number) {
  const missingRuns = Math.max(0, Math.trunc(currentMissingRuns)) + 1;
  return { missingRuns, enabled: missingRuns < INSTRUMENT_MASTER_MISSING_GRACE_RUNS };
}

export function classifyKr(row: KrRow) {
  const isEtp = ["EF", "FE", "EN"].includes(row.securityGroupCode) || ["1", "2", "3", "4", "5"].includes(row.etpProductClassCode);
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

export function classifyUs(row: Pick<UsRow, "code" | "name" | "englishName" | "securityType" | "etpType" | "isEtf" | "isLeveraged" | "isInverse" | "isWarrant" | "isDerivative" | "isDr">) {
  const descriptor = `${row.name} ${row.englishName}`;
  const hasEtpType = row.etpType.trim().length > 0;
  // Require acquisition-specific words rather than matching the substring
  // "spac" in ordinary names such as AEROSPACE or SPACEMOBILE.
  const isSpac = /(?:\bSPAC\b|\bACQ\b|\bACQUISITIONS?\b|\bBLANK\s*CHECK\b|ACQUISITIONS?(?:\s+CORP(?:ORATION)?\b)|스팩|기업인수목적|애퀴지션)/i.test(descriptor);
  const isUnit = /\bUNITS?\b|(?:\/UN|\/U|\.U)$/i.test(`${descriptor} ${row.code}`);
  const isPreferred = /(?:우선주|\bPREFERRED\b|\bPREF\b|\bPFD\b|\bDEP(?:OSITARY)?\s+SHS\b)/i.test(descriptor);
  const isWarrant = row.isWarrant || /\bWARRANTS?\b|\bC\/WTS\b|\bWTS\b|(?:\/WS[A-Z]?|\.WS[A-Z]?|\/W)$/i.test(`${descriptor} ${row.code}`);
  const isRight = /\bRIGHTS?\b|(?:\/RT|\.R)$/i.test(`${descriptor} ${row.code}`);
  const isConvertible = /\bCONVERTIBLE\b|전환사채|전환우선/i.test(descriptor);
  // KIS's overseas master marks some listed debt issues as security type 2.
  // Treat explicit coupon/note descriptors as debt so they cannot enter the
  // common-stock universe or stock-only refresh/scanner work.
  const isDebtSecurity = /\b\d+(?:\.\d+)?%\s+(?:(?:SENIOR|SNR|SECURED|SUBORDINATED)\s+)*(?:NOTES?|NTS?)\b|\b\d+(?:\.\d+)?%\s+SNR\b|\b(?:SENIOR\s+)?NOTES?\s+(?:DUE|MATURING)\b|\bDEBENTURES?\b|\bBONDS?\s+DUE\b/i.test(descriptor);
  const isDerivative = row.isDerivative || row.isLeveraged || row.isInverse || isUnit || isPreferred || isWarrant || isRight || isConvertible || isDebtSecurity;
  const instrumentType = isDebtSecurity ? "DEBT_SECURITY"
    : isSpac ? "SPAC"
    : isDerivative ? "DERIVATIVE"
      : row.isEtf || row.securityType === "3" ? "ETF"
        : row.isDr ? "DR"
          : hasEtpType ? "ETP"
            : row.securityType === "2" ? "COMMON_STOCK"
            : row.securityType === "1" ? "INDEX"
              : "NON_COMMON_SECURITY";

  return { instrumentType, isWarrant, isDerivative, isDebtSecurity };
}

type StoredUsRow = typeof usCommonStockUniverse.$inferSelect;
type ClassifiedStoredUsRow = { row: StoredUsRow; classification: ReturnType<typeof classifyUs> };

export function splitUsUniverseRows(rows: StoredUsRow[]) {
  const common: ClassifiedStoredUsRow[] = [];
  const special: ClassifiedStoredUsRow[] = [];
  for (const row of rows) {
    const classification = classifyUs(row);
    const item = { row, classification };
    if (classification.instrumentType === "COMMON_STOCK" && !row.isEtf && !row.isWarrant && !classification.isDerivative && !row.isDr && !row.isLeveraged && !row.isInverse) common.push(item);
    else special.push(item);
  }
  return { common, special };
}

/**
 * Reconcile already-imported overseas rows after classifier fixes. Defaults to
 * dry-run; moving a row copies it to the destination table and disables the
 * source row inside one transaction, preserving IDs/history in each partition.
 */
export async function reconcileUsUniversePartitions({ apply = false }: { apply?: boolean } = {}) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  return db.transaction(async (tx) => {
    const [commonRows, specialRows] = await Promise.all([
      tx.select().from(usCommonStockUniverse).where(eq(usCommonStockUniverse.enabled, true)),
      tx.select().from(usSpecialInstrumentUniverse).where(eq(usSpecialInstrumentUniverse.enabled, true)),
    ]);
    const commonSplit = splitUsUniverseRows(commonRows);
    const specialSplit = splitUsUniverseRows(specialRows);
    const toSpecial = commonSplit.special;
    const toCommon = specialSplit.common;
    const result = {
      apply,
      commonActive: commonRows.length,
      specialActive: specialRows.length,
      commonToSpecial: toSpecial.length,
      specialToCommon: toCommon.length,
      moved: 0,
      commonToSpecialRows: toSpecial.map(({ row, classification }) => ({ market: row.market, code: row.code, name: row.name, englishName: row.englishName, instrumentType: classification.instrumentType })),
      specialToCommonRows: toCommon.map(({ row, classification }) => ({ market: row.market, code: row.code, name: row.name, englishName: row.englishName, instrumentType: classification.instrumentType })),
    };
    if (!apply || (!toSpecial.length && !toCommon.length)) return result;

    const now = new Date();
    const persisted = (item: ClassifiedStoredUsRow) => {
      const { id: _id, ...row } = item.row;
      return { ...row, instrumentType: item.classification.instrumentType, isWarrant: item.classification.isWarrant, isDerivative: item.classification.isDerivative, enabled: true, updatedAt: now };
    };
    const upsertCommon = async (items: ClassifiedStoredUsRow[]) => {
      for (let offset = 0; offset < items.length; offset += 250) {
        const batch = items.slice(offset, offset + 250).map(persisted);
        await tx.insert(usCommonStockUniverse).values(batch).onConflictDoUpdate({ target: [usCommonStockUniverse.market, usCommonStockUniverse.code], set: { realtimeSymbol: sql`excluded.realtime_symbol`, name: sql`excluded.name`, englishName: sql`excluded.english_name`, instrumentType: sql`excluded.instrument_type`, etpType: sql`excluded.etp_type`, securityType: sql`excluded.security_type`, currency: sql`excluded.currency`, countryCode: sql`excluded.country_code`, industryCode: sql`excluded.industry_code`, isEtf: sql`excluded.is_etf`, isLeveraged: sql`excluded.is_leveraged`, isInverse: sql`excluded.is_inverse`, isWarrant: sql`excluded.is_warrant`, isDerivative: sql`excluded.is_derivative`, isDr: sql`excluded.is_dr`, enabled: true, sourceFile: sql`excluded.source_file`, rawPayload: sql`excluded.raw_payload`, lastSeenAt: sql`excluded.last_seen_at`, missingRuns: sql`excluded.missing_runs`, updatedAt: now } });
      }
    };
    const upsertSpecial = async (items: ClassifiedStoredUsRow[]) => {
      for (let offset = 0; offset < items.length; offset += 250) {
        const batch = items.slice(offset, offset + 250).map(persisted);
        await tx.insert(usSpecialInstrumentUniverse).values(batch).onConflictDoUpdate({ target: [usSpecialInstrumentUniverse.market, usSpecialInstrumentUniverse.code], set: { realtimeSymbol: sql`excluded.realtime_symbol`, name: sql`excluded.name`, englishName: sql`excluded.english_name`, instrumentType: sql`excluded.instrument_type`, etpType: sql`excluded.etp_type`, securityType: sql`excluded.security_type`, currency: sql`excluded.currency`, countryCode: sql`excluded.country_code`, industryCode: sql`excluded.industry_code`, isEtf: sql`excluded.is_etf`, isLeveraged: sql`excluded.is_leveraged`, isInverse: sql`excluded.is_inverse`, isWarrant: sql`excluded.is_warrant`, isDerivative: sql`excluded.is_derivative`, isDr: sql`excluded.is_dr`, enabled: true, sourceFile: sql`excluded.source_file`, rawPayload: sql`excluded.raw_payload`, lastSeenAt: sql`excluded.last_seen_at`, missingRuns: sql`excluded.missing_runs`, updatedAt: now } });
      }
    };
    await upsertCommon(toCommon);
    await upsertSpecial(toSpecial);
    for (const market of ["NAS", "NYS", "AMS"] as const) {
      const commonCodes = toCommon.filter((item) => item.row.market === market).map((item) => item.row.code);
      const specialCodes = toSpecial.filter((item) => item.row.market === market).map((item) => item.row.code);
      if (commonCodes.length) await tx.update(usSpecialInstrumentUniverse).set({ enabled: false, updatedAt: now }).where(and(eq(usSpecialInstrumentUniverse.market, market), inArray(usSpecialInstrumentUniverse.code, commonCodes)));
      if (specialCodes.length) await tx.update(usCommonStockUniverse).set({ enabled: false, updatedAt: now }).where(and(eq(usCommonStockUniverse.market, market), inArray(usCommonStockUniverse.code, specialCodes)));
    }
    result.moved = toCommon.length + toSpecial.length;
    return result;
  });
}

export async function importInstrumentMasters(sourceDirectory: string) {
  const db = getDb();
  if (instrumentMasterImportInProgress) throw new Error("INSTRUMENT_MASTER_IMPORT_ALREADY_RUNNING");
  instrumentMasterImportInProgress = true;
  const startedAt = new Date();
  let runId: number;
  try {
    const run = await db.insert(instrumentUniverseSyncRuns).values({ scope: "KR_DOMESTIC_US_OVERSEAS", sourceDirectory, status: "PROCESSING", startedAt }).returning({ id: instrumentUniverseSyncRuns.id });
    if (!run[0]) throw new Error("INSTRUMENT_MASTER_SYNC_RUN_NOT_CREATED");
    runId = run[0].id;
  } catch (error) {
    instrumentMasterImportInProgress = false;
    throw error;
  }
  try {
    const files: Array<{ name: string; kind: "KR" | "US"; market: KrRow["market"] | UsRow["market"] }> = [
      { name: "kospi_code.mst", kind: "KR", market: "KOSPI" }, { name: "kosdaq_code.mst", kind: "KR", market: "KOSDAQ" },
      { name: "NASMST.COD", kind: "US", market: "NAS" }, { name: "NYSMST.COD", kind: "US", market: "NYS" }, { name: "AMSMST.COD", kind: "US", market: "AMS" },
    ];
    const krRows: KrRow[] = []; const usRows: UsRow[] = []; const missing: string[] = [];
    for (const file of files) {
      try {
        const bytes = await readFile(path.join(sourceDirectory, file.name));
        if (file.kind === "KR") {
          const rows = parseDomestic(bytes, file.market as KrRow["market"], file.name);
          if (rows.length === 0) missing.push(`${file.name}:EMPTY`);
          else krRows.push(...rows);
        } else {
          const rows = parseOverseas(bytes, file.market as UsRow["market"], file.name);
          if (rows.length === 0) missing.push(`${file.name}:EMPTY`);
          else usRows.push(...rows);
        }
      } catch {
        missing.push(file.name);
      }
    }
    if (missing.length || krRows.length + usRows.length === 0) throw new Error(`MASTER_FILE_MISSING:${missing.join(",") || "EMPTY"}`);
    const now = new Date(); let saved = 0;
    // 원본 마스터에는 같은 시장·코드가 반복될 수 있습니다. PostgreSQL의
    // ON CONFLICT UPDATE는 한 INSERT 안에서 같은 대상 행을 두 번 갱신할 수
    // 없으므로, 배치 전에 키 기준으로 마지막 레코드만 남깁니다.
    const uniqueKrRows = [...new Map(krRows.map((row) => [`${row.market}:${row.code}`, row])).values()];
    const uniqueUsRows = [...new Map(usRows.map((row) => [`${row.market}:${row.code}`, row])).values()];
    for (let offset = 0; offset < uniqueKrRows.length; offset += 250) { const rows = uniqueKrRows.slice(offset, offset + 250).map((row) => ({ ...row, ...classifyKr(row), enabled: true, lastSeenAt: now, updatedAt: now })); const common = rows.filter((row) => row.instrumentType === "COMMON_STOCK" && !row.isSuspended && !["Y", "1"].includes(row.managedIssueCode)); const special = rows.filter((row) => !common.includes(row)); const upsert = async (table: typeof krCommonStockUniverse, batch: typeof common) => { if (!batch.length) return; await db.insert(table).values(batch).onConflictDoUpdate({ target: [table.market, table.code], set: { standardCode: sql`excluded.standard_code`, name: sql`excluded.name`, instrumentType: sql`excluded.instrument_type`, securityGroupCode: sql`excluded.security_group_code`, marketCapScale: sql`excluded.market_cap_scale`, industryLargeCode: sql`excluded.industry_large_code`, industryMediumCode: sql`excluded.industry_medium_code`, industrySmallCode: sql`excluded.industry_small_code`, etpProductClassCode: sql`excluded.etp_product_class_code`, preferredClassCode: sql`excluded.preferred_class_code`, tradingHaltCode: sql`excluded.trading_halt_code`, liquidationCode: sql`excluded.liquidation_code`, managedIssueCode: sql`excluded.managed_issue_code`, isEtp: sql`excluded.is_etp`, isWarrant: sql`excluded.is_warrant`, isPreferred: sql`excluded.is_preferred`, isSuspended: sql`excluded.is_suspended`, enabled: true, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); }; await upsert(krCommonStockUniverse, common); await upsert(krSpecialInstrumentUniverse, special); const market = rows[0]?.market; if (market && common.length) await db.update(krSpecialInstrumentUniverse).set({ enabled: false, lastSeenAt: now, updatedAt: now }).where(and(eq(krSpecialInstrumentUniverse.market, market), inArray(krSpecialInstrumentUniverse.code, common.map((row) => row.code)))); if (market && special.length) await db.update(krCommonStockUniverse).set({ enabled: false, lastSeenAt: now, updatedAt: now }).where(and(eq(krCommonStockUniverse.market, market), inArray(krCommonStockUniverse.code, special.map((row) => row.code)))); saved += rows.length; }
    for (let offset = 0; offset < uniqueUsRows.length; offset += 250) { const rows = uniqueUsRows.slice(offset, offset + 250).map((row) => ({ ...row, ...classifyUs(row), enabled: true, lastSeenAt: now, updatedAt: now })); const common = rows.filter((row) => row.instrumentType === "COMMON_STOCK" && !row.isEtf && !row.isWarrant && !row.isDerivative && !row.isDr && !row.isLeveraged && !row.isInverse); const special = rows.filter((row) => !common.includes(row)); const upsert = async (table: typeof usCommonStockUniverse, batch: typeof common) => { if (!batch.length) return; await db.insert(table).values(batch).onConflictDoUpdate({ target: [table.market, table.code], set: { realtimeSymbol: sql`excluded.realtime_symbol`, name: sql`excluded.name`, englishName: sql`excluded.english_name`, instrumentType: sql`excluded.instrument_type`, etpType: sql`excluded.etp_type`, securityType: sql`excluded.security_type`, currency: sql`excluded.currency`, countryCode: sql`excluded.country_code`, industryCode: sql`excluded.industry_code`, isEtf: sql`excluded.is_etf`, isWarrant: sql`excluded.is_warrant`, isDerivative: sql`excluded.is_derivative`, isDr: sql`excluded.is_dr`, enabled: true, sourceFile: sql`excluded.source_file`, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); }; await upsert(usCommonStockUniverse, common); await upsert(usSpecialInstrumentUniverse, special); const market = rows[0]?.market; if (market && common.length) await db.update(usSpecialInstrumentUniverse).set({ enabled: false, lastSeenAt: now, updatedAt: now }).where(and(eq(usSpecialInstrumentUniverse.market, market), inArray(usSpecialInstrumentUniverse.code, common.map((row) => row.code)))); if (market && special.length) await db.update(usCommonStockUniverse).set({ enabled: false, lastSeenAt: now, updatedAt: now }).where(and(eq(usCommonStockUniverse.market, market), inArray(usCommonStockUniverse.code, special.map((row) => row.code)))); saved += rows.length; }
    // Age absent rows only after every required master parsed and all upserts
    // succeeded. One missed import is tolerated; a second consecutive complete
    // miss disables the stale ticker. A later reappearance resets missingRuns.
    const ageMissing = async (table: typeof krCommonStockUniverse | typeof krSpecialInstrumentUniverse | typeof usCommonStockUniverse | typeof usSpecialInstrumentUniverse) => {
      const aged = await db.update(table).set({
        missingRuns: sql`${table.missingRuns} + 1`,
        enabled: sql`${table.missingRuns} + 1 < ${INSTRUMENT_MASTER_MISSING_GRACE_RUNS}`,
        updatedAt: now,
      }).where(and(eq(table.enabled, true), sql`${table.lastSeenAt} < ${startedAt}`)).returning({ enabled: table.enabled });
      return aged.filter((row) => !row.enabled).length;
    };
    const deactivatedCount = (await ageMissing(krCommonStockUniverse))
      + await ageMissing(krSpecialInstrumentUniverse)
      + await ageMissing(usCommonStockUniverse)
      + await ageMissing(usSpecialInstrumentUniverse);
    await db.update(instrumentUniverseSyncRuns).set({ status: "COMPLETED", sourceCount: saved, insertedCount: saved, deactivatedCount, completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId));
    return { ok: true, runId, sourceCount: saved, domesticCount: krRows.length, overseasCount: usRows.length, deactivatedCount, files, missingFiles: [] };
  } catch (error) { await db.update(instrumentUniverseSyncRuns).set({ status: "FAILED", errorCount: 1, errorSummary: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId)); throw error; }
  finally { instrumentMasterImportInProgress = false; }
}

/** Import only the official KIS KOSPI and KOSDAQ masters. This path intentionally
 * leaves the overseas universe untouched and does not age absent rows: it is
 * safe to bootstrap the domestic universe independently. */
export async function importDomesticInstrumentMasters(files: Array<{ name: string; buffer: Buffer }>) {
  const db = getDb();
  if (!db) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  if (instrumentMasterImportInProgress) throw new Error("INSTRUMENT_MASTER_IMPORT_ALREADY_RUNNING");
  instrumentMasterImportInProgress = true;
  let runId: number | undefined;
  const startedAt = new Date();
  try {
    const expected = ["kospi_code.mst", "kosdaq_code.mst"] as const;
    const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
    if (files.length !== expected.length || expected.some((name) => !byName.has(name))) {
      throw new Error(`DOMESTIC_MASTER_FILES_REQUIRED:${expected.join(",")}`);
    }
    const rows: KrRow[] = [
      ...parseDomestic(byName.get("kospi_code.mst")!.buffer, "KOSPI", "kospi_code.mst"),
      ...parseDomestic(byName.get("kosdaq_code.mst")!.buffer, "KOSDAQ", "kosdaq_code.mst"),
    ];
    const counts = { KOSPI: rows.filter((row) => row.market === "KOSPI").length, KOSDAQ: rows.filter((row) => row.market === "KOSDAQ").length };
    if (counts.KOSPI < 100 || counts.KOSDAQ < 100) throw new Error("DOMESTIC_MASTER_INCOMPLETE");
    const uniqueRows = [...new Map(rows.map((row) => [`${row.market}:${row.code}`, row])).values()];
    const run = await db.insert(instrumentUniverseSyncRuns).values({ scope: "KR", sourceDirectory: "KIS_DOMESTIC_MASTER_UPLOAD", status: "RUNNING", sourceCount: uniqueRows.length }).returning({ id: instrumentUniverseSyncRuns.id });
    runId = run[0]?.id;

    let commonCount = 0;
    let specialCount = 0;
    await db.transaction(async (tx) => {
      for (const market of ["KOSPI", "KOSDAQ"] as const) {
        const marketRows = uniqueRows.filter((row) => row.market === market);
        for (let offset = 0; offset < marketRows.length; offset += 250) {
        const batch = marketRows.slice(offset, offset + 250).map((row) => {
          const classification = classifyKr(row);
          const enabledCommon = classification.instrumentType === "COMMON_STOCK" && !classification.isSuspended && !["Y", "1"].includes(row.managedIssueCode);
          return { ...row, ...classification, enabled: true, lastSeenAt: startedAt, updatedAt: startedAt, enabledCommon };
        });
        const common = batch.filter((row) => row.enabledCommon).map(({ enabledCommon: _enabledCommon, ...row }) => row);
        const special = batch.filter((row) => !row.enabledCommon).map(({ enabledCommon: _enabledCommon, ...row }) => row);
        const upsert = async (table: typeof krCommonStockUniverse | typeof krSpecialInstrumentUniverse, values: typeof common) => {
          if (!values.length) return;
          await tx.insert(table).values(values).onConflictDoUpdate({ target: [table.market, table.code], set: {
            standardCode: sql`excluded.standard_code`, name: sql`excluded.name`, instrumentType: sql`excluded.instrument_type`, securityGroupCode: sql`excluded.security_group_code`, marketCapScale: sql`excluded.market_cap_scale`, industryLargeCode: sql`excluded.industry_large_code`, industryMediumCode: sql`excluded.industry_medium_code`, industrySmallCode: sql`excluded.industry_small_code`, etpProductClassCode: sql`excluded.etp_product_class_code`, preferredClassCode: sql`excluded.preferred_class_code`, tradingHaltCode: sql`excluded.trading_halt_code`, liquidationCode: sql`excluded.liquidation_code`, managedIssueCode: sql`excluded.managed_issue_code`, isEtp: sql`excluded.is_etp`, isWarrant: sql`excluded.is_warrant`, isPreferred: sql`excluded.is_preferred`, isSuspended: sql`excluded.is_suspended`, enabled: true, rawPayload: sql`excluded.raw_payload`, sourceFile: sql`excluded.source_file`, missingRuns: 0, lastSeenAt: startedAt, updatedAt: startedAt,
          } });
        };
        await upsert(krCommonStockUniverse, common);
        await upsert(krSpecialInstrumentUniverse, special);
        if (market && common.length) await tx.update(krSpecialInstrumentUniverse).set({ enabled: false, updatedAt: startedAt }).where(and(eq(krSpecialInstrumentUniverse.market, market), inArray(krSpecialInstrumentUniverse.code, common.map((row) => row.code))));
        if (market && special.length) await tx.update(krCommonStockUniverse).set({ enabled: false, updatedAt: startedAt }).where(and(eq(krCommonStockUniverse.market, market), inArray(krCommonStockUniverse.code, special.map((row) => row.code))));
        commonCount += common.length;
        specialCount += special.length;
        }
      }
    });
    if (runId) await db.update(instrumentUniverseSyncRuns).set({ status: "COMPLETED", insertedCount: commonCount + specialCount, updatedCount: 0, excludedCount: specialCount, completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId));
    return { ok: true, runId, sourceCount: uniqueRows.length, marketCounts: counts, commonStockCount: commonCount, specialInstrumentCount: specialCount, overseasUpdated: false };
  } catch (error) {
    if (runId) await db.update(instrumentUniverseSyncRuns).set({ status: "FAILED", errorCount: 1, errorSummary: error instanceof Error ? error.message.slice(0, 1000) : "unknown error", completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId));
    throw error;
  } finally {
    instrumentMasterImportInProgress = false;
  }
}
