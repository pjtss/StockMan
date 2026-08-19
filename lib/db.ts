import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
    }

    try {
      const url = new URL(databaseUrl);
      console.info("[DB] Connecting to:", `${url.hostname}${url.port ? `:${url.port}` : ""}`);
    } catch {
      console.info("[DB] Connecting to: <unparsed DATABASE_URL>");
    }

    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
    });
  }

  return pool;
}

let dbInstance: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

/**
 * Flyway가 모든 스키마 변경을 소유한다. 애플리케이션은 연결 가능 여부만
 * 확인하며, 런타임에 테이블을 재생성하거나 DDL을 실행하지 않는다.
 */
export async function ensureSchema() {
  const client = await getPool().connect();
  try {
    await client.query("SELECT 1");
  } finally {
    client.release();
  }
}
