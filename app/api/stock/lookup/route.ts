import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

const US_EXCHANGES = ["NAS", "NYS", "AMS"] as const;
const KR_EXCHANGES = ["KOSPI", "KOSDAQ"] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") === "US" ? "US" : "KR";
  const requestedExchange = searchParams.get("exchange")?.trim().toUpperCase() || null;
  const allowedExchanges = market === "US" ? US_EXCHANGES : KR_EXCHANGES;
  if (requestedExchange && !allowedExchanges.includes(requestedExchange as never)) {
    return NextResponse.json({ ok: false, error: "INVALID_EXCHANGE" }, { status: 400 });
  }

  const codes = [...new Set((searchParams.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean))].slice(0, 100);
  if (!codes.length) return NextResponse.json({ names: {} });
  const table = market === "US" ? "us_common_stock_universe" : "kr_common_stock_universe";
  try {
    const result = await getPool().query<{ market: string; code: string; realtime_symbol?: string | null; name: string | null }>(
      market === "US"
        ? `SELECT u.market, u.code, u.realtime_symbol,
                  COALESCE(NULLIF(u.name, ''), NULLIF(u.english_name, ''), NULLIF(f.name, '')) AS name
             FROM ${table} u
             LEFT JOIN LATERAL (
               SELECT name FROM instrument_fundamental_snapshots
                WHERE market = u.market AND code IN (u.code, u.realtime_symbol)
                ORDER BY fetched_at DESC LIMIT 1
             ) f ON true
            WHERE u.instrument_type = 'COMMON_STOCK'
              AND COALESCE(u.is_etf, false) = false AND COALESCE(u.is_warrant, false) = false
              AND COALESCE(u.is_derivative, false) = false AND COALESCE(u.is_dr, false) = false
              AND COALESCE(u.is_leveraged, false) = false AND COALESCE(u.is_inverse, false) = false
              AND (u.code = ANY($1) OR u.realtime_symbol = ANY($1))
              AND ($2::text IS NULL OR u.market = $2)
            ORDER BY u.market, u.code`
        : `SELECT u.market, u.code, NULL::text AS realtime_symbol,
                  COALESCE(NULLIF(u.name, ''), NULLIF(compat.name, ''), NULLIF(f.name, '')) AS name
             FROM ${table} u
             LEFT JOIN kr_instrument_universe compat ON compat.market = u.market AND compat.code = u.code
             LEFT JOIN LATERAL (
               SELECT name FROM instrument_fundamental_snapshots
                WHERE market = u.market AND code = u.code
                ORDER BY fetched_at DESC LIMIT 1
             ) f ON true
            WHERE u.instrument_type = 'COMMON_STOCK' AND u.code = ANY($1)
              AND ($2::text IS NULL OR u.market = $2)
            ORDER BY u.market, u.code`,
      [codes, requestedExchange],
    );

    const aliases = new Map<string, Set<string>>();
    const names: Record<string, string> = {};
    for (const row of result.rows) {
      const code = String(row.code ?? "").trim().toUpperCase();
      const exchange = String(row.market ?? "").trim().toUpperCase();
      const name = String(row.name ?? "").trim();
      if (!code || !name || !allowedExchanges.includes(exchange as never)) continue;
      const rowAliases = [code, row.realtime_symbol?.trim().toUpperCase()].filter((value): value is string => Boolean(value));
      for (const alias of rowAliases) {
        names[`${exchange}:${alias}`] = name;
        const values = aliases.get(alias) ?? new Set<string>();
        values.add(name);
        aliases.set(alias, values);
      }
    }
    for (const [alias, values] of aliases) {
      if (values.size !== 1) continue;
      const name = [...values][0];
      names[`${market}:${alias}`] = name;
      names[alias] = name;
    }
    return NextResponse.json({ names });
  } catch {
    return NextResponse.json({ ok: false, error: "LOOKUP_UNAVAILABLE" }, { status: 503 });
  }
}
