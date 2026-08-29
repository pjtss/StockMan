import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const market = searchParams.get("market") === "US" ? "US" : "KR";
  const codes = [...new Set((searchParams.get("codes") ?? "").split(",").map((code) => code.trim().toUpperCase()).filter(Boolean))];
  if (!codes.length) return NextResponse.json({ names: {} });
  const table = market === "US" ? "us_common_stock_universe" : "kr_common_stock_universe";
  const rows = (await getPool().query(`SELECT code, name FROM ${table} WHERE enabled = TRUE AND code = ANY($1)`, [codes])).rows;
  return NextResponse.json({ names: Object.fromEntries(rows.map((row) => [row.code, row.name])) });
}
