import { sql } from "drizzle-orm";

/** 공식 KIS 종목 마스터 기준 공통 거래 대상 판정 모듈. */
export function isEligibleKrCommonStock(row: { instrumentType?: unknown; tradingHaltCode?: unknown; liquidationCode?: unknown; managedIssueCode?: unknown; isSuspended?: unknown }) {
  const flag = (value: unknown) => value === true || ["Y", "1"].includes(String(value ?? ""));
  const managed = String(row.managedIssueCode ?? "").toUpperCase();
  return row.instrumentType === "COMMON_STOCK" && !flag(row.isSuspended) && !flag(row.tradingHaltCode) && !flag(row.liquidationCode) && managed !== "Y";
}

export function isEligibleUsCommonStock(row: { instrumentType?: unknown; isEtf?: unknown; isWarrant?: unknown; isDerivative?: unknown; isDr?: unknown; isLeveraged?: unknown; isInverse?: unknown; enabled?: unknown }) {
  const flag = (value: unknown) => value === true;
  return row.instrumentType === "COMMON_STOCK" && row.enabled !== false && !flag(row.isEtf) && !flag(row.isWarrant) && !flag(row.isDerivative) && !flag(row.isDr) && !flag(row.isLeveraged) && !flag(row.isInverse);
}

export function commonStockEligibilitySql(market: "KR" | "US") {
  if (market === "KR") return "enabled = true AND instrument_type = 'COMMON_STOCK' AND COALESCE(is_suspended, false) = false AND COALESCE(trading_halt_code, '') NOT IN ('Y','1') AND COALESCE(liquidation_code, '') NOT IN ('Y','1') AND COALESCE(managed_issue_code, '') <> 'Y'";
  return "enabled = true AND instrument_type = 'COMMON_STOCK' AND COALESCE(is_etf, false) = false AND COALESCE(is_warrant, false) = false AND COALESCE(is_derivative, false) = false AND COALESCE(is_dr, false) = false AND COALESCE(is_leveraged, false) = false AND COALESCE(is_inverse, false) = false";
}

/**
 * Reads the official eligibility query, with a compatibility fallback for a
 * local database that has not yet applied the latest classification migration.
 * The fallback only uses columns introduced with the universe tables and is
 * explicitly reported to callers so it cannot be mistaken for a full filter.
 */
export async function queryEligibleUniverse(db: { execute: (query: unknown) => Promise<any> }, market: "KR" | "US") {
  const table = market === "KR" ? "kr_instrument_universe" : "us_instrument_universe";
  const full = `SELECT market, code, name FROM ${table} WHERE ${commonStockEligibilitySql(market)}`;
  try {
    return { rows: (await db.execute(sql.raw(full))).rows as any[], compatibilityFallback: false };
  } catch (error) {
    // Drizzle wraps PostgreSQL 42703 in a generic "Failed query" message on
    // some drivers, so the original column error is not always present here.
    // Retrying the baseline query is safe: a real connection/query failure
    // will fail again and be returned to the caller.
    const base = market === "KR"
      ? "enabled = true AND instrument_type = 'COMMON_STOCK' AND COALESCE(is_suspended, false) = false"
      : "enabled = true AND instrument_type = 'COMMON_STOCK' AND COALESCE(is_etf, false) = false AND COALESCE(is_warrant, false) = false AND COALESCE(is_derivative, false) = false AND COALESCE(is_dr, false) = false";
    try {
      return { rows: (await db.execute(sql.raw(`SELECT market, code, name FROM ${table} WHERE ${base}`))).rows as any[], compatibilityFallback: true };
    } catch (fallbackError) {
      const detail = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      throw new Error(`Universe schema/query unavailable (${market}); official query failed and compatibility query failed: ${detail}`);
    }
  }
}

export const eligibilityPolicy = {
  kr: "COMMON_STOCK + 공식 거래정지·청산·관리종목·is_suspended 제외",
  us: "COMMON_STOCK + 상품 유형 제외; 공식 거래정지 필드 미제공",
} as const;
