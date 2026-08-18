import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { instrumentUniverseSyncRuns, krInstrumentUniverse, usInstrumentUniverse } from "@/lib/schema";

type KrRow = { market: "KOSPI" | "KOSDAQ"; code: string; standardCode: string; name: string; securityGroupCode: string; marketCapScale: string; sourceFile: string; rawPayload: string };
type UsRow = { market: "NAS" | "NYS" | "AMS"; code: string; realtimeSymbol: string; name: string; englishName: string; securityType: string; etpType: string; currency: string; countryCode: string; industryCode: string; isEtf: boolean; isWarrant: boolean; isDerivative: boolean; isDr: boolean; sourceFile: string; rawPayload: string };

function decode(bytes: Buffer) { return new TextDecoder("euc-kr").decode(bytes); }
function clean(value: string | undefined) { return (value ?? "").replace(/\0/g, "").trim(); }
function bool(value: string) { return value.toUpperCase() === "Y"; }

export function parseDomestic(buffer: Buffer, market: "KOSPI" | "KOSDAQ", sourceFile: string): KrRow[] {
  return decode(buffer).split(/\r?\n/).map((raw) => raw.replace(/\r$/, "")).filter(Boolean).map((raw) => ({
    market, code: clean(raw.slice(0, 6)), standardCode: clean(raw.slice(9, 21)), name: clean(raw.slice(21, 61)), securityGroupCode: clean(raw.slice(61, 63)), marketCapScale: clean(raw.slice(63, 64)), sourceFile, rawPayload: raw,
  })).filter((row) => row.code.length === 6);
}

export function parseOverseas(buffer: Buffer, market: "NAS" | "NYS" | "AMS", sourceFile: string): UsRow[] {
  return decode(buffer).split(/\r?\n/).map((raw) => raw.replace(/\r$/, "")).filter(Boolean).map((raw) => {
    const f = raw.split("\t").map(clean);
    const securityType = f[8] ?? ""; const etpType = f[24] ?? "";
    return { market, code: f[4] ?? "", realtimeSymbol: f[5] ?? "", name: f[6] ?? "", englishName: f[7] ?? "", securityType, etpType, currency: f[9] ?? "", countryCode: f[0] ?? "", industryCode: f[23] ?? "", isEtf: securityType === "3" || ["001", "005"].includes(etpType), isWarrant: securityType === "4", isDerivative: securityType === "4" || ["002", "003", "006"].includes(etpType), isDr: bool(f[20] ?? ""), sourceFile, rawPayload: raw };
  }).filter((row) => row.code.length > 0);
}

function classifyKr(row: KrRow) {
  const excluded = ["EF", "EW", "SW", "SR", "FE"].includes(row.securityGroupCode);
  return { instrumentType: excluded ? "EXCLUDED_PRODUCT" : row.securityGroupCode === "DR" ? "DR" : "COMMON_STOCK", isEtp: ["EF", "FE"].includes(row.securityGroupCode), isWarrant: ["EW", "SW", "SR"].includes(row.securityGroupCode), isPreferred: row.code.endsWith("5") || row.name.endsWith("우") };
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
    for (let offset = 0; offset < uniqueKrRows.length; offset += 250) { const rows = uniqueKrRows.slice(offset, offset + 250).map((row) => ({ ...row, ...classifyKr(row), enabled: true, lastSeenAt: now, updatedAt: now })); await db.insert(krInstrumentUniverse).values(rows).onConflictDoUpdate({ target: [krInstrumentUniverse.market, krInstrumentUniverse.code], set: { standardCode: sql`excluded.standard_code`, name: sql`excluded.name`, instrumentType: sql`excluded.instrument_type`, securityGroupCode: sql`excluded.security_group_code`, marketCapScale: sql`excluded.market_cap_scale`, enabled: true, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); saved += rows.length; }
    for (let offset = 0; offset < uniqueUsRows.length; offset += 250) { const rows = uniqueUsRows.slice(offset, offset + 250).map((row) => ({ ...row, instrumentType: row.isWarrant || row.isDerivative ? "DERIVATIVE" : row.isEtf ? "ETF" : row.isDr ? "DR" : "COMMON_STOCK", enabled: true, lastSeenAt: now, updatedAt: now })); await db.insert(usInstrumentUniverse).values(rows).onConflictDoUpdate({ target: [usInstrumentUniverse.market, usInstrumentUniverse.code], set: { realtimeSymbol: sql`excluded.realtime_symbol`, name: sql`excluded.name`, englishName: sql`excluded.english_name`, instrumentType: sql`excluded.instrument_type`, etpType: sql`excluded.etp_type`, securityType: sql`excluded.security_type`, currency: sql`excluded.currency`, enabled: true, rawPayload: sql`excluded.raw_payload`, missingRuns: 0, lastSeenAt: now, updatedAt: now } }); saved += rows.length; }
    await db.update(instrumentUniverseSyncRuns).set({ status: "COMPLETED", sourceCount: saved, insertedCount: saved, completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId));
    return { ok: true, runId, sourceCount: saved, domesticCount: krRows.length, overseasCount: usRows.length, files, missingFiles: [] };
  } catch (error) { await db.update(instrumentUniverseSyncRuns).set({ status: "FAILED", errorCount: 1, errorSummary: error instanceof Error ? error.message : String(error), completedAt: new Date() }).where(eq(instrumentUniverseSyncRuns.id, runId)); throw error; }
}
