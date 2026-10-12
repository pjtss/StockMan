import { NextResponse } from "next/server";
import {
  fetchKisUsConditionSearch,
  filterKisUsConditionRows,
  KIS_US_CONDITION_MARKETS,
  parseKisUsConditionQuery,
  sanitizeKisUsConditionRaw,
} from "@/lib/kis-us-condition-search";
import { writeKisSignalSnapshot } from "@/lib/kis-signal-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsedQuery = parseKisUsConditionQuery(url.searchParams);
  if (!parsedQuery.ok) {
    return NextResponse.json({ ok: false, error: parsedQuery.error, field: parsedQuery.field, message: parsedQuery.message, markets: parsedQuery.error === "INVALID_MARKET" ? KIS_US_CONDITION_MARKETS : undefined }, { status: 400 });
  }
  const { market, filters } = parsedQuery.value;
  const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ""));
  let result;
  try {
    result = await fetchKisUsConditionSearch(parsedQuery.value);
  } catch (error) {
    console.error("[API /kis/us-search] KIS request failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ ok: false, error: "KIS_REQUEST_FAILED", source: "KIS", market }, { status: 502 });
  }
  if (!result) return NextResponse.json({ ok: false, error: "KIS_TOKEN_UNAVAILABLE", source: "KIS", market }, { status: 503 });

  const collectedAt = new Date().toISOString();
  let eligibility = { requestedCount: result.rows.length, eligibleCount: 0, excludedCount: result.rows.length };
  let eligibleSourceRows: Record<string, unknown>[] = [];
  if (result.ok && result.rows.length) {
    try {
      const eligible = await filterKisUsConditionRows(market, result.rows);
      eligibility = eligible;
      eligibleSourceRows = eligible.rows;
    } catch {
      return NextResponse.json({ ok: false, error: "COMMON_STOCK_UNIVERSE_UNAVAILABLE", source: "LOCAL_DB", market, eligibility: { failClosed: true } }, { status: 503 });
    }
  }

  const rows = eligibleSourceRows.map((row, index) => ({
    ...row,
    rank: row.rank ?? row.data_rank ?? index + 1,
    market,
    code: String(row.symb ?? row.code ?? "").trim().toUpperCase(),
    name: String(row.name ?? row.hts_kor_isnm ?? row.prdt_name ?? "").trim() || null,
    observedAt: collectedAt,
  }));
  const safeRaw = sanitizeKisUsConditionRaw(result.raw, eligibleSourceRows);
  let snapshotStored = true;
  try {
    await writeKisSignalSnapshot({
      market: "US",
      code: "SEARCH",
      signalType: "candidate_us_condition_search",
      status: result.ok ? "AVAILABLE" : "UNAVAILABLE",
      observedAt: new Date(collectedAt),
      payload: { filters: activeFilters, eligibility: { ...eligibility, source: "us_common_stock_universe", failClosed: true }, rows },
      rawPayload: JSON.stringify(safeRaw),
    });
  } catch {
    snapshotStored = false;
  }

  const responseBody = {
    ok: result.ok,
    source: "KIS",
    market,
    status: result.status,
    signalType: "candidate_us_condition_search",
    collectedAt,
    filters: activeFilters,
    diagnostics: result.diagnostics,
    eligibility: { ...eligibility, source: "us_common_stock_universe", failClosed: true },
    pagination: { supported: false, maximumRows: 100, returnedRows: result.rows.length },
    snapshot: { stored: snapshotStored },
    ...(snapshotStored ? {} : { warning: "SIGNAL_SNAPSHOT_WRITE_FAILED" }),
    rows,
    raw: safeRaw,
    ...(result.error ? { upstreamError: result.error } : {}),
  };
  return NextResponse.json(responseBody, { status: result.ok ? 200 : 502 });
}
