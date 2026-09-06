import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") === "US" ? "US" : "KR";
  const codes = [...new Set((searchParams.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  if (!codes.length) return NextResponse.json({ names: {} });
  const table = market === "US" ? "us_common_stock_universe" : "kr_common_stock_universe";
  // Chart lookup must resolve names for both active and inactive instruments;
  // activity filtering belongs to screeners, not the chart display.
  try {
  const rows = (await getPool().query(
    market === "US"
      ? `SELECT u.code, u.realtime_symbol, COALESCE(NULLIF(u.name, ''), NULLIF(u.english_name, ''), NULLIF(f.name, '')) AS name
           FROM ${table} u
           LEFT JOIN instrument_fundamental_snapshots f ON f.market = u.market
              AND f.code IN (u.code, u.realtime_symbol)
          WHERE u.code = ANY($1) OR u.realtime_symbol = ANY($1)
          ORDER BY f.fetched_at DESC NULLS LAST`
      : `WITH candidates AS (
           SELECT code, name, 1 AS priority FROM kr_common_stock_universe WHERE code = ANY($1)
           UNION ALL
           SELECT code, name, 2 AS priority FROM kr_instrument_universe WHERE code = ANY($1)
           UNION ALL
           SELECT code, name, 3 AS priority
             FROM instrument_fundamental_snapshots
            WHERE code = ANY($1) AND market IN ('KR', 'KOSPI', 'KOSDAQ')
         ), ranked AS (
           SELECT DISTINCT ON (code) code, NULLIF(name, '') AS name
             FROM candidates
            WHERE NULLIF(name, '') IS NOT NULL
            ORDER BY code, priority
         )
         SELECT code, name FROM ranked ORDER BY code`,
    [codes],
  )).rows;
  const names = Object.fromEntries(rows.filter((row) => row.code && row.name).flatMap((row) => [[row.code, row.name], ...(row.realtime_symbol ? [[row.realtime_symbol, row.name]] : [])]));
  return NextResponse.json({ names });
  } catch { return NextResponse.json({ ok: false, error: "LOOKUP_UNAVAILABLE" }, { status: 503 }); }
}
