import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { responseTimeMs, resolveRequestId, withRequestTrace } from "@/lib/request-trace";
import { scanStoredKrBollingerBands } from "@/lib/kr-bollinger-band";
import { scanStoredUsBollingerBands } from "@/lib/us-bollinger-band";
import { loadStoredUsInstrumentScopes } from "@/lib/us-top-rising-universe";

export const dynamic = "force-dynamic";

async function safeQuery<T extends import("pg").QueryResultRow>(sql: string, values: unknown[] = []) {
  try {
    const result = await getPool().query<T>(sql, values);
    return { ok: true, rows: result.rows };
  } catch (error) {
    return { ok: false, rows: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function inventory() {
  const tables = ["kr_instrument_universe", "kr_instrument_universe_candles", "us_instrument_universe", "us_instrument_universe_candles"];
  const tableResult = await safeQuery<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name", [tables]);
  const present = new Set(tableResult.rows.map((row) => row.table_name));
  const counts: Record<string, unknown> = {};
  for (const table of tables) {
    if (!present.has(table)) { counts[table] = { exists: false, count: null }; continue; }
    const result = await safeQuery<{ count: string }>(`SELECT COUNT(*)::text AS count FROM "${table}"`);
    counts[table] = { exists: true, count: result.ok ? Number(result.rows[0]?.count ?? 0) : null, error: result.error };
  }
  const flyway = await safeQuery<{ version: string | null; description: string | null }>("SELECT version, description FROM flyway_schema_history WHERE success=true ORDER BY installed_rank DESC LIMIT 1");
  return { tables: counts, flyway: flyway.ok ? flyway.rows[0] ?? null : { error: flyway.error } };
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  if (!(await requireAdminSession())) return withRequestTrace(NextResponse.json({ ok: false, error: "Unauthorized", requestId }, { status: 401 }), requestId, startedAt);
  const url = new URL(request.url);
  const market = (url.searchParams.get("market") ?? "all").toUpperCase();
  const run = ["1", "true", "yes"].includes((url.searchParams.get("run") ?? "").toLowerCase());
  const body: Record<string, unknown> = { ok: true, mode: run ? "ADMIN_DEBUG_RUN" : "ADMIN_DEBUG_SNAPSHOT", checkedAt: new Date().toISOString(), requestId, responseTimeMs: responseTimeMs(startedAt), requestedMarket: market, environment: { kisConfigured: Boolean(process.env.KIS_APPKEY && process.env.KIS_APPSECRET), databaseConfigured: Boolean(process.env.DATABASE_URL), cronSecretConfigured: Boolean(process.env.CRON_SECRET) }, inventory: await inventory() };
  if (run && (market === "KR" || market === "ALL")) {
    try { body.kr = { scan: await scanStoredKrBollingerBands() }; }
    catch (error) { body.kr = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  if (run && (market === "US" || market === "ALL")) {
    try { const universe = await loadStoredUsInstrumentScopes(); body.us = { universe: universe.universe, scan: await scanStoredUsBollingerBands() }; }
    catch (error) { body.us = { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  }
  body.responseTimeMs = responseTimeMs(startedAt);
  return withRequestTrace(NextResponse.json(body), requestId, startedAt);
}
