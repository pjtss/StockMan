import { getDb, ensureSchema } from "../lib/db";
import { topRisingStocks, kisCache } from "../lib/schema";
import * as fs from "fs";
import * as path from "path";

// .env.local에서 DATABASE_URL 읽기
try {
  const envPath = path.join(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/DATABASE_URL=["']?([^"'\r\n]+)["']?/);
    if (match) {
      process.env.DATABASE_URL = match[1];
      console.log("DATABASE_URL 로드 성공:", process.env.DATABASE_URL.substring(0, 30) + "...");
    }
  }
} catch (e) {
  console.error(".env.local 로딩 에러:", e);
}

async function main() {
  console.log("DB 내 모든 Mock 데이터 삭제 작업 시작...");
  try {
    const db = getDb();
    if (!db) {
      console.error("DB가 null입니다.");
      return;
    }

    // topRisingStocks 테이블 비우기 (Mock/시뮬레이션 데이터 제거)
    console.log("topRisingStocks 테이블 데이터 비우는 중...");
    await db.delete(topRisingStocks);
    console.log("완료.");

    // 혹시 kisCache 에도 top_rising_stocks 가짜 캐시가 있다면 제거
    console.log("kisCache 테이블에서 top_rising_stocks 관련 캐시 비우는 중...");
    const { eq } = require("drizzle-orm");
    await db.delete(kisCache).where(eq(kisCache.key, "top_rising_stocks"));
    console.log("완료.");

    const records = await db.select().from(topRisingStocks);
    console.log("현재 topRisingStocks 레코드 개수:", records.length);
  } catch (err) {
    console.error("삭제 작업 중 에러 발생:", err);
  }
}

main();
