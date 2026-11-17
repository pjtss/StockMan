import { getPool } from "@/lib/db";

export const KR_MARKET_CAP_MAX_AGE_HOURS = 24;

/** KIS domestic ranking market-cap fields use 억원 units. */
export function parseKrMarketCapInBillionWon(row: Record<string, unknown>) {
  const value = row.marketCap ?? row.stck_avls ?? row.hts_avls ?? row.mrkt_cap ?? row.market_cap;
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function meetsKrMarketCapFloor(row: Record<string, unknown>, floorInBillionWon = 300) {
  const cap = parseKrMarketCapInBillionWon(row);
  return cap !== null && cap > floorInBillionWon;
}

/** Returns only fresh, positive KRW snapshots; absent, stale, or ambiguous values stay unavailable. */
export async function loadKrMarketCapSnapshots(items: Array<string | { market: string; code: string }>) {
  const requested = items.map((item) => typeof item === "string"
    ? { code: item.trim(), market: null as string | null }
    : { code: String(item?.code ?? "").trim(), market: String(item?.market ?? "").trim().toUpperCase() || null })
    .filter((item) => item.code && (!item.market || item.market === "KOSPI" || item.market === "KOSDAQ"));
  const uniqueCodes = [...new Set(requested.map((item) => item.code))];
  const codeOnlyCodes = [...new Set(requested.filter((item) => !item.market).map((item) => item.code))];
  const caps = new Map<string, number | null>();
  if (uniqueCodes.length === 0) return caps;
  const exactScopes = [...new Map(requested.filter((item) => item.market).map((item) => [`${item.market}:${item.code}`, item])).values()];
  const result = await getPool().query<{ market: string; code: string; market_cap: number | string | null; currency: string | null; fetched_at: Date | string | null }>(
    `WITH requested AS (
       SELECT market, code FROM unnest($1::text[], $2::text[]) AS exact_scope(market, code)
       UNION
       SELECT u.market, u.code FROM kr_common_stock_universe u
        WHERE u.enabled = true AND u.instrument_type = 'COMMON_STOCK'
          AND COALESCE(u.is_etp, false) = false AND COALESCE(u.is_warrant, false) = false
          AND COALESCE(u.is_preferred, false) = false AND COALESCE(u.is_suspended, false) = false
          AND COALESCE(u.trading_halt_code, '') NOT IN ('Y', '1')
          AND COALESCE(u.liquidation_code, '') NOT IN ('Y', '1')
          AND COALESCE(u.managed_issue_code, '') <> 'Y'
          AND u.market IN ('KOSPI', 'KOSDAQ') AND u.code = ANY($3::text[])
     )
     SELECT requested.market, requested.code, f.market_cap, f.currency, f.fetched_at
       FROM requested
       LEFT JOIN instrument_fundamental_snapshots f
         ON f.market = requested.market AND f.code = requested.code`,
    [exactScopes.map((item) => item.market), exactScopes.map((item) => item.code), codeOnlyCodes],
  );
  const codeCandidates = new Map<string, Array<number | null>>();
  for (const row of result.rows) {
    const value = row.market_cap == null ? NaN : Number(row.market_cap);
    const fetchedAt = row.fetched_at == null ? NaN : new Date(row.fetched_at).getTime();
    const ageMs = Date.now() - fetchedAt;
    const fresh = Number.isFinite(fetchedAt) && ageMs >= 0 && ageMs <= KR_MARKET_CAP_MAX_AGE_HOURS * 60 * 60 * 1000;
    const cap = row.currency === "KRW" && fresh && Number.isFinite(value) && value > 0 ? value : null;
    const key = `${row.market}:${row.code}`;
    caps.set(key, cap);
    const candidates = codeCandidates.get(row.code) ?? [];
    candidates.push(cap);
    codeCandidates.set(row.code, candidates);
  }
  for (const [code, candidates] of codeCandidates) caps.set(code, candidates.length === 1 ? candidates[0] : null);
  for (const item of requested) if (!item.market && !codeCandidates.has(item.code)) caps.set(item.code, null);
  for (const item of exactScopes) if (!caps.has(`${item.market}:${item.code}`)) caps.set(`${item.market}:${item.code}`, null);
  return caps;
}

export async function filterKrRowsByStoredMarketCap<T>(rows: T[], codeOf: (row: T) => unknown = (row) => (row as any)?.code) {
  if (rows.length === 0) return [] as T[];
  const requested = rows.map((row) => {
    const market = String((row as any)?.market ?? "").trim().toUpperCase();
    const code = String(codeOf(row) ?? "").trim();
    return market === "KOSPI" || market === "KOSDAQ" ? { market, code } : code;
  });
  const caps = await loadKrMarketCapSnapshots(requested);
  return rows.filter((row) => {
    const market = String((row as any)?.market ?? "").trim().toUpperCase();
    const code = String(codeOf(row) ?? "").trim();
    return meetsKrMarketCapFloorKrw(caps.get(market === "KOSPI" || market === "KOSDAQ" ? `${market}:${code}` : code) ?? null);
  });
}

export function meetsKrMarketCapFloorKrw(value: number | null | undefined, floorKrw = 30_000_000_000) {
  return value != null && Number.isFinite(value) && value > floorKrw;
}
