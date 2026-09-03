import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const table = url.searchParams.get("table")?.trim() || "";
  const rawLimit = Number(url.searchParams.get("limit") || 50);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
  try {
    const pool = getPool();
    const tables = await pool.query(`SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`);
    if (!table) return NextResponse.json({ tables: tables.rows.map((row) => row.name), columns: [], rows: [] });
    if (!tables.rows.some((row) => row.name === table)) return NextResponse.json({ error: "INVALID_TABLE" }, { status: 400 });
    const columns = await pool.query(`SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table]);
    const rows = await pool.query(`SELECT * FROM public."${table.replaceAll('"', '""')}" LIMIT $1`, [limit]);
    return NextResponse.json({ tables: tables.rows.map((row) => row.name), columns: columns.rows, rows: rows.rows });
  } catch { return NextResponse.json({ error: "DATABASE_READ_FAILED" }, { status: 503 }); }
}
