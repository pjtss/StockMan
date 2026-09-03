import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const company = searchParams.get("company");

    if (!company || company.length > 200) {
      return NextResponse.json({ error: "Company parameter is required" }, { status: 400 });
    }

    await ensureSchema();
    const client = await getPool().connect();
    const companyPattern = company.replace(/[\\%_]/g, (value) => `\\${value}`);

    try {
      const { rows } = await client.query(
        `
          SELECT title, judgment, published_at as "publishedAt", link
          FROM filings
          WHERE company ILIKE $1 ESCAPE '\\'
          ORDER BY published_at DESC
          LIMIT 50
        `,
        [companyPattern]
      );

      // If database contains historical records, return them.
      if (rows.length > 0) {
        return NextResponse.json(rows);
      }

      // Empty is the truthful result. Never fabricate disclosures when the
      // database has no records; the UI can distinguish this from an error.
      return NextResponse.json([], { headers: { "x-debug-status": "empty", "x-debug-reason": "No stored DART filings for this company." } });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("Failed to fetch historical filings:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ error: "공시 이력 데이터를 불러오지 못했습니다." }, { status: 503 });
  }
}
