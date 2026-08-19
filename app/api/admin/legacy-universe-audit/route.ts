import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";

const LEGACY_TABLES = ["kr_instruments", "us_instruments", "kr_daily_price_candles", "us_daily_price_candles"] as const;

export async function GET() {
  const startedAt = Date.now();
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const db = getDb();
    const tableRows = await db.execute(sql`SELECT t.table_name, EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) AS exists, CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables x WHERE x.table_schema = 'public' AND x.table_name = t.table_name) THEN (SELECT c.reltuples::bigint FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = t.table_name) ELSE 0 END AS estimated_rows FROM unnest(ARRAY['kr_instruments','us_instruments','kr_daily_price_candles','us_daily_price_candles']::text[]) AS t(table_name)`);
    const fkRows = await db.execute(sql`SELECT tc.table_name, kcu.column_name, ccu.table_name AS referenced_table, ccu.column_name AS referenced_column, tc.constraint_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema WHERE tc.constraint_type = 'FOREIGN KEY' AND ccu.table_schema = 'public' AND ccu.table_name IN ('kr_instruments','us_instruments','kr_daily_price_candles','us_daily_price_candles') ORDER BY tc.table_name, tc.constraint_name`);
    const references = fkRows.rows;
    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, legacyTables: tableRows.rows, foreignKeys: references, safeToDrop: references.length === 0, criteria: { legacyTables: [...LEGACY_TABLES], requiresZeroForeignKeys: true, note: "코드·뷰·트리거 감사와 신규 캐시 운영 성공 확인 후 DROP 마이그레이션을 작성합니다." } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - startedAt }, { status: 500 });
  }
}
