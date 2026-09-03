import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const timestampCandidates = ["updated_at", "fetched_at", "observed_at", "created_at", "published_at", "candle_time"];

export async function GET() {
  const startedAt = Date.now();
  try {
    if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const db = getDb();
    const tableRows = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`);
    const tables = (tableRows.rows as Array<{ table_name: string }>).map((row) => row.table_name);
    const results = await Promise.all(tables.map(async (table) => {
      try {
        const columns = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name IN ('updated_at','fetched_at','observed_at','created_at','published_at','candle_time')`);
        const available = new Set((columns.rows as Array<{ column_name: string }>).map((row) => row.column_name));
        const timestampColumn = timestampCandidates.find((column) => available.has(column));
        const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::bigint AS row_count FROM public.${quoteIdentifier(table)}`));
        const latestResult = timestampColumn ? await db.execute(sql.raw(`SELECT MAX(${quoteIdentifier(timestampColumn)}) AS latest_updated_at FROM public.${quoteIdentifier(table)}`)) : null;
        return { table, rowCount: Number((countResult.rows[0] as any)?.row_count ?? 0), timestampColumn, latestUpdatedAt: (latestResult?.rows[0] as any)?.latest_updated_at ?? null, ok: true };
      } catch (error) {
        console.error(`[API /admin/database-status] Table ${table} failed:`, error instanceof Error ? error.message.slice(0, 500) : "unknown error");
        return { table, rowCount: null, timestampColumn: null, latestUpdatedAt: null, ok: false, error: "TABLE_STATUS_UNAVAILABLE" };
      }
    }));
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, tableCount: results.length, tables: results });
  } catch (error) {
    console.error("[API /admin/database-status] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, durationMs: Date.now() - startedAt, error: "DATABASE_STATUS_UNAVAILABLE" }, { status: 503 });
  }
}
