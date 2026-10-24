import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { classifyUs, parseOverseas } from "@/lib/instrument-universe-import";

export const KIS_US_MASTER_FILES = {
  NAS: "NASMST.COD",
  NYS: "NYSMST.COD",
  AMS: "AMSMST.COD",
} as const;

type Market = keyof typeof KIS_US_MASTER_FILES;
type IndustryRow = { market: Market; code: string; industryCode: string; sourceFile: string };
type AuditSourceRow = {
  market: Market;
  code: string;
  industry_code: string;
  source_file: string;
  is_common_candidate: boolean;
  exclusion_reason: string;
  security_type: string;
  is_dr: boolean;
  etp_type: string;
  instrument_type: string;
};

/** KIS mastcode.icod is a four-character numeric field; all-zero values mean unclassified. */
export function isValidKisUsIndustryCode(value: string | null | undefined): value is string {
  const code = value?.trim() ?? "";
  return /^\d{1,4}$/.test(code) && !/^0+$/.test(code);
}

/** Parse only KIS-master-confirmed active U.S. common stocks. No name-based fallback. */
export function buildKisUsIndustryRows(files: Partial<Record<Market, Buffer>>) {
  const rows: IndustryRow[] = [];
  const sourceCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
  const eligibleCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
  const unclassifiedCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
  const auditRows: AuditSourceRow[] = [];

  for (const market of Object.keys(KIS_US_MASTER_FILES) as Market[]) {
    const fileName = KIS_US_MASTER_FILES[market];
    const buffer = files[market];
    if (!buffer?.length) throw new Error(`KIS_MASTER_REQUIRED:${fileName}`);
    const parsed = parseOverseas(buffer, market, fileName);
    if (!parsed.length) throw new Error(`KIS_MASTER_EMPTY:${fileName}`);
    const lineCount = new TextDecoder("euc-kr").decode(buffer).split(/\r?\n/).filter((line) => line.trim().length > 0).length;
    if (parsed.length !== lineCount) throw new Error(`KIS_MASTER_MALFORMED_ROWS:${fileName}`);
    if (parsed.some((row) => row.rawPayload.split("\t").length !== 24 || row.rawPayload.split("\t")[2]?.trim() !== market)) {
      throw new Error(`KIS_MASTER_SCHEMA_OR_MARKET_MISMATCH:${fileName}`);
    }
    sourceCounts[market] = parsed.length;
    const seen = new Set<string>();
    for (const row of parsed) {
      if (seen.has(row.code)) throw new Error(`KIS_MASTER_DUPLICATE_TICKER:${market}:${row.code}`);
      seen.add(row.code);
      const industryCode = row.industryCode.trim();
      const classification = classifyUs(row);
      const exclusionReason = row.securityType !== "2" ? `SECURITY_TYPE_${row.securityType || "UNKNOWN"}`
        : row.isDr ? "DR"
          : row.isEtf || row.etpType.trim() ? "ETP"
            : row.isWarrant ? "WARRANT"
              : row.isDerivative || classification.instrumentType !== "COMMON_STOCK" ? classification.instrumentType
                : "";
      const isCommonCandidate = exclusionReason === "";
      auditRows.push({
        market, code: row.code, industry_code: industryCode, source_file: fileName,
        is_common_candidate: isCommonCandidate, exclusion_reason: exclusionReason,
        security_type: row.securityType, is_dr: row.isDr, etp_type: row.etpType.trim(),
        instrument_type: classification.instrumentType,
      });
      if (!isCommonCandidate) continue;
      eligibleCounts[market] += 1;
      if (!isValidKisUsIndustryCode(industryCode)) {
        unclassifiedCounts[market] += 1;
      }
      rows.push({ market, code: row.code, industryCode, sourceFile: fileName });
    }
    if (eligibleCounts[market] === 0) throw new Error(`KIS_MASTER_NO_COMMON_STOCKS:${fileName}`);
  }

  return { rows, auditRows, sourceCounts, eligibleCounts, unclassifiedCounts };
}

/** Read-only, row-level audit. It never updates either universe partition or industry codes. */
export async function auditKisUsIndustryUniverse(files: Partial<Record<Market, Buffer>>) {
  const prepared = buildKisUsIndustryRows(files);
  const client = await getPool().connect();
  try {
    await client.query("BEGIN READ ONLY");
    const query = await client.query(
      `WITH audit_source AS (
         SELECT * FROM jsonb_to_recordset($1::jsonb) AS src(
           market text, code text, industry_code text, source_file text,
           is_common_candidate boolean, exclusion_reason text, security_type text,
           is_dr boolean, etp_type text, instrument_type text
         )
       ), audit_result AS (
         SELECT src.market, src.code, src.is_common_candidate, src.exclusion_reason,
                src.security_type AS kis_security_type, src.is_dr AS kis_is_dr,
                src.etp_type AS kis_etp_type, src.instrument_type AS kis_instrument_type,
                src.industry_code AS kis_industry_code, src.source_file AS kis_source_file,
                c.enabled AS common_enabled, c.instrument_type AS common_instrument_type,
                c.industry_code AS database_industry_code, c.name AS database_name,
                c.english_name AS database_english_name,
                s.enabled AS special_enabled, s.instrument_type AS special_instrument_type
         FROM audit_source AS src
         LEFT JOIN us_common_stock_universe AS c ON c.market = src.market AND c.code = src.code
         LEFT JOIN us_special_instrument_universe AS s ON s.market = src.market AND s.code = src.code
         WHERE src.is_common_candidate = TRUE
            OR (c.enabled = TRUE AND c.instrument_type = 'COMMON_STOCK')
         UNION ALL
         SELECT c.market, c.code, FALSE, 'NOT_IN_KIS_MASTER',
                NULL, NULL, NULL, NULL, NULL, NULL,
                TRUE, c.instrument_type, c.industry_code, c.name, c.english_name,
                s.enabled, s.instrument_type
         FROM us_common_stock_universe AS c
         LEFT JOIN us_special_instrument_universe AS s ON s.market = c.market AND s.code = c.code
         WHERE c.market IN ('NAS','NYS','AMS') AND c.enabled = TRUE AND c.instrument_type = 'COMMON_STOCK'
           AND NOT EXISTS (SELECT 1 FROM audit_source AS src WHERE src.market = c.market AND src.code = c.code)
       )
       SELECT * FROM audit_result ORDER BY market, code`,
      [JSON.stringify(prepared.auditRows)],
    );
    const rows = query.rows;
    const marketSummary = Object.fromEntries((Object.keys(KIS_US_MASTER_FILES) as Market[]).map((market) => {
      const scoped = rows.filter((row) => row.market === market);
      const candidates = scoped.filter((row) => row.is_common_candidate === true);
      const matched = candidates.filter((row) => row.common_enabled === true && row.common_instrument_type === "COMMON_STOCK");
      const activeDbOnly = scoped.filter((row) => row.common_enabled === true && row.common_instrument_type === "COMMON_STOCK" && row.is_common_candidate !== true);
      const sourceOnly = candidates.filter((row) => !(row.common_enabled === true && row.common_instrument_type === "COMMON_STOCK"));
      return [market, {
        sourceCount: prepared.sourceCounts[market],
        commonCandidateCount: prepared.eligibleCounts[market],
        candidateUnclassifiedCount: prepared.unclassifiedCounts[market],
        matchedActiveCommonCount: matched.length,
        candidateMissingActiveCommonCount: sourceOnly.length,
        activeCommonOutsideKisCandidatesCount: activeDbOnly.length,
        industryMismatchCount: matched.filter((row) => row.database_industry_code !== row.kis_industry_code).length,
        databaseOnlyReasons: Object.fromEntries([...new Set(activeDbOnly.map((row) => String(row.exclusion_reason)))].sort().map((reason) => [reason, activeDbOnly.filter((row) => row.exclusion_reason === reason).length])),
      }];
    }));
    await client.query("COMMIT");
    return {
      ok: true,
      mode: "READ_ONLY_KIS_UNIVERSE_AUDIT",
      source: "KIS_US_MASTER_ICOD",
      sourceCounts: prepared.sourceCounts,
      eligibleCounts: prepared.eligibleCounts,
      unclassifiedCounts: prepared.unclassifiedCounts,
      marketSummary,
      discrepancyRows: rows.filter((row) => row.is_common_candidate !== true || !(row.common_enabled === true && row.common_instrument_type === "COMMON_STOCK")),
      databaseWritePerformed: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Update only the existing common-stock partition, in one transaction per market. */
export async function syncKisUsIndustryCodes(files: Partial<Record<Market, Buffer>>) {
  const prepared = buildKisUsIndustryRows(files);
  let stage = "database_connect";
  let client: PoolClient | undefined;
  try {
    client = await getPool().connect();
    stage = "begin_transaction";
    await client.query("BEGIN");
    const persistedCounts: Record<Market, number> = { NAS: 0, NYS: 0, AMS: 0 };
    const validationCounts: Record<Market, { matchedCount: number; missingCount: number; mismatchCount: number; unmatchedCodes: string[]; activeDatabaseOnlyCount: number; activeDatabaseOnlyCodes: string[] }> = {
      NAS: { matchedCount: 0, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
      NYS: { matchedCount: 0, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
      AMS: { matchedCount: 0, missingCount: 0, mismatchCount: 0, unmatchedCodes: [], activeDatabaseOnlyCount: 0, activeDatabaseOnlyCodes: [] },
    };
    for (const market of Object.keys(KIS_US_MASTER_FILES) as Market[]) {
      stage = `update_${market}`;
      const marketRows = prepared.rows.filter((row) => row.market === market).map((row) => ({
        market: row.market,
        code: row.code,
        industry_code: row.industryCode,
        source_file: row.sourceFile,
      }));
      const result = await client.query(
        `UPDATE us_common_stock_universe AS u
         SET industry_code = src.industry_code,
             source_file = src.source_file,
             updated_at = NOW()
         FROM jsonb_to_recordset($1::jsonb)
           AS src(market text, code text, industry_code text, source_file text)
         WHERE u.market = src.market
           AND u.code = src.code
           AND u.enabled = TRUE
           AND u.instrument_type = 'COMMON_STOCK'`,
        [JSON.stringify(marketRows)],
      );
      persistedCounts[market] = result.rowCount ?? 0;
      stage = `verify_${market}_source_values`;
      const validation = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE u.code IS NOT NULL)::int AS matched_count,
           COUNT(*) FILTER (WHERE u.code IS NULL)::int AS missing_count,
           COUNT(*) FILTER (WHERE u.code IS NOT NULL AND u.industry_code IS DISTINCT FROM src.industry_code)::int AS mismatch_count,
           COALESCE(ARRAY_AGG(src.code ORDER BY src.code) FILTER (WHERE u.code IS NULL), ARRAY[]::text[]) AS unmatched_codes
         FROM jsonb_to_recordset($1::jsonb)
           AS src(market text, code text, industry_code text, source_file text)
         LEFT JOIN us_common_stock_universe AS u
           ON u.market = src.market AND u.code = src.code
          AND u.enabled = TRUE AND u.instrument_type = 'COMMON_STOCK'`,
        [JSON.stringify(marketRows)],
      );
      const values = validation.rows[0] ?? {};
      validationCounts[market] = {
        matchedCount: Number(values.matched_count ?? 0),
        missingCount: Number(values.missing_count ?? 0),
        mismatchCount: Number(values.mismatch_count ?? 0),
        unmatchedCodes: Array.isArray(values.unmatched_codes) ? values.unmatched_codes : [],
        activeDatabaseOnlyCount: 0,
        activeDatabaseOnlyCodes: [],
      };
      stage = `verify_${market}_active_database_only`;
      const activeDatabaseOnly = await client.query(
        `SELECT u.code
         FROM us_common_stock_universe AS u
         WHERE u.market = $1 AND u.enabled = TRUE AND u.instrument_type = 'COMMON_STOCK'
           AND NOT EXISTS (
             SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS src(market text, code text, industry_code text, source_file text)
             WHERE src.market = u.market AND src.code = u.code
           )
         ORDER BY u.code`,
        [market, JSON.stringify(marketRows)],
      );
      validationCounts[market].activeDatabaseOnlyCount = activeDatabaseOnly.rowCount ?? activeDatabaseOnly.rows.length;
      validationCounts[market].activeDatabaseOnlyCodes = activeDatabaseOnly.rows.map((row) => String(row.code));
      if (validationCounts[market].mismatchCount > 0) {
        const error = new Error(`KIS industry source value mismatch for ${market}`);
        Object.assign(error, { usIndustrySyncFailure: "KIS_SOURCE_VALUE_MISMATCH" });
        throw error;
      }
    }
    stage = "verify_database_coverage";
    const coverage = await client.query(`
      SELECT market, COUNT(*)::int AS active_common_count,
        COUNT(*) FILTER (WHERE industry_code ~ '^[0-9]{1,4}$' AND industry_code !~ '^0+$')::int AS classified_count,
        COUNT(*) FILTER (WHERE industry_code IS NULL OR industry_code !~ '^[0-9]{1,4}$' OR industry_code ~ '^0+$')::int AS unclassified_count
      FROM us_common_stock_universe
      WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND market IN ('NAS','NYS','AMS')
      GROUP BY market ORDER BY market
    `);
    stage = "commit_transaction";
    await client.query("COMMIT");
    const { rows: _rows, auditRows: _auditRows, ...summary } = prepared;
    const unmatchedCounts = Object.fromEntries((Object.keys(KIS_US_MASTER_FILES) as Market[]).map((market) => [market, validationCounts[market].missingCount])) as Record<Market, number>;
    return { ok: true, source: "KIS_US_MASTER_ICOD", ...summary, persistedCounts, unmatchedCounts, validationCounts, dbCoverage: coverage.rows };
  } catch (error) {
    await client?.query("ROLLBACK").catch(() => undefined);
    if (error && typeof error === "object") Object.assign(error, { usIndustrySyncStage: stage });
    throw error;
  } finally {
    client?.release();
  }
}
