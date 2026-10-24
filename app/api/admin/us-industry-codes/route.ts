import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { requireAdminSession } from "@/lib/admin-auth";
import { describeError, safeErrorMetadata } from "@/lib/error-diagnostics";
import { KIS_US_MASTER_FILES, syncKisUsIndustryCodes } from "@/lib/us-industry-code-sync";

export const runtime = "nodejs";

export async function GET() {
  try {
    if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    const result = await getPool().query(`
      SELECT market, COUNT(*)::int AS active_common_count,
        COUNT(*) FILTER (WHERE industry_code ~ '^[0-9]{1,4}$' AND industry_code !~ '^0+$')::int AS classified_count,
        COUNT(*) FILTER (WHERE industry_code IS NULL OR industry_code !~ '^[0-9]{1,4}$' OR industry_code ~ '^0+$')::int AS unclassified_count
      FROM us_common_stock_universe
      WHERE enabled = TRUE AND instrument_type = 'COMMON_STOCK' AND market IN ('NAS','NYS','AMS')
      GROUP BY market ORDER BY market
    `);
    return NextResponse.json({ ok: true, source: "KIS_US_MASTER_ICOD", checkedAt: new Date().toISOString(), markets: result.rows });
  } catch {
    return NextResponse.json({ ok: false, error: "US_INDUSTRY_DIAGNOSTIC_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
    if (!(request.headers.get("content-type") || "").includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, error: "KIS_MASTER_MULTIPART_REQUIRED", requiredFiles: Object.values(KIS_US_MASTER_FILES) }, { status: 400 });
    }
    const form = await request.formData();
    const files = new Map<string, Buffer>();
    for (const [field, value] of form.entries()) {
      if (typeof value === "string" || !value || typeof value.arrayBuffer !== "function" || value.size === 0) continue;
      const name = ("name" in value && typeof value.name === "string" ? value.name : "") || field;
      if (Object.values(KIS_US_MASTER_FILES).includes(name as (typeof KIS_US_MASTER_FILES)[keyof typeof KIS_US_MASTER_FILES])) {
        files.set(name, Buffer.from(await value.arrayBuffer()));
      }
    }
    const byMarket = {
      NAS: files.get(KIS_US_MASTER_FILES.NAS),
      NYS: files.get(KIS_US_MASTER_FILES.NYS),
      AMS: files.get(KIS_US_MASTER_FILES.AMS),
    };
    const result = await syncKisUsIndustryCodes(byMarket);
    return NextResponse.json({ ...result, synchronizedAt: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    const safe = safeErrorMetadata(error);
    const details = describeError(error);
    const stage = error && typeof error === "object" && "usIndustrySyncStage" in error && typeof error.usIndustrySyncStage === "string"
      ? error.usIndustrySyncStage
      : "request_validation_or_upload";
    const isInputError = message.startsWith("KIS_MASTER_");
    console.error("[us-industry-codes] sync failed", JSON.stringify({ stage, ...safe }));
    const diagnostic = isInputError ? undefined : {
      stage,
      ...safe,
      ...(error && typeof error === "object" && "usIndustrySyncFailure" in error && typeof error.usIndustrySyncFailure === "string"
        ? { failure: error.usIndustrySyncFailure }
        : {}),
      ...(details.table ? { table: details.table } : {}),
      ...(details.column ? { column: details.column } : {}),
      ...(details.constraint ? { constraint: details.constraint } : {}),
    };
    return NextResponse.json({ ok: false, error: isInputError ? message : "US_INDUSTRY_SYNC_FAILED", ...(diagnostic ? { diagnostic } : {}) }, { status: isInputError ? 400 : 500 });
  }
}
