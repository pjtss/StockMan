import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";
import { loadAutomationDebugSnapshot } from "@/lib/automation-debug";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supplied = request.headers.get("x-cron-secret") || "";
  const cronAuthorized = Boolean(process.env.CRON_SECRET && supplied === process.env.CRON_SECRET);
  if (!cronAuthorized && !(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const moduleKey = params.get("module") || undefined;
  const status = params.get("status")?.toUpperCase() || undefined;
  const limitValue = Number(params.get("limit") || 10);
  const sinceValue = params.get("since");
  const untilValue = params.get("until");
  const since = sinceValue ? new Date(sinceValue) : undefined;
  const until = untilValue ? new Date(untilValue) : undefined;
  if (moduleKey && !getFeatureModule(moduleKey)) return NextResponse.json({ ok: false, stage: "validate_filter", errorCode: "UNKNOWN_FEATURE_MODULE", module: moduleKey }, { status: 400 });
  if (status && !["RUNNING", "SUCCESS", "PARTIAL", "FAILED", "SKIPPED"].includes(status)) return NextResponse.json({ ok: false, stage: "validate_filter", errorCode: "UNKNOWN_RUN_STATUS", status }, { status: 400 });
  if (!Number.isFinite(limitValue) || limitValue < 1) return NextResponse.json({ ok: false, stage: "validate_filter", errorCode: "INVALID_LIMIT", limit: params.get("limit") }, { status: 400 });
  if ((sinceValue && Number.isNaN(since?.getTime())) || (untilValue && Number.isNaN(until?.getTime()))) return NextResponse.json({ ok: false, stage: "validate_filter", errorCode: "INVALID_DATE", since: sinceValue || null, until: untilValue || null }, { status: 400 });
  if (since && until && since >= until) return NextResponse.json({ ok: false, stage: "validate_filter", errorCode: "INVALID_DATE_RANGE", since: since.toISOString(), until: until.toISOString() }, { status: 400 });
  try {
    return NextResponse.json(await loadAutomationDebugSnapshot({
      moduleKey: moduleKey as FeatureModuleKey | undefined,
      status,
      since,
      until,
      limit: limitValue,
      includeSummary: params.get("includeSummary") !== "false",
    }));
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: "load_automation_runs", ...diagnostics, checkedAt: new Date().toISOString() }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
