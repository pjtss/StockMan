import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveSecTicker } from "@/lib/sec-company-ticker";
import { syncSecCompany, syncSecCompanyFacts } from "@/lib/sec-edgar-repository";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const ticker = params.get("ticker")?.trim().toUpperCase() || "";
  const cik = params.get("cik")?.replace(/\D/g, "").padStart(10, "0") || "";
  if (!ticker && !cik) return NextResponse.json({ ok: false, error: "ticker 또는 cik이 필요합니다." }, { status: 400 });
  let mapping = null;
  let resolvedCik = cik;
  try {
    mapping = ticker ? await resolveSecTicker(ticker) : null;
    resolvedCik = cik || mapping?.cik || "";
    if (!resolvedCik) return NextResponse.json({ ok: false, error: `SEC CIK를 찾지 못했습니다: ${ticker}`, mapping }, { status: 404 });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: "mapping", request: { ticker, cik: resolvedCik, facts: false }, mapping, ...diagnostics, checkedAt: new Date().toISOString() }, { status: 502 });
  }
  let submissions;
  try {
    submissions = await syncSecCompany(resolvedCik);
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: isSchemaError(error) ? "database_persist" : "submissions_fetch_or_persist", request: { ticker, cik: resolvedCik, facts: false }, mapping, submissions: { ok: false, ...diagnostics }, facts: null, ...diagnostics, checkedAt: new Date().toISOString() }, { status: isSchemaError(error) ? 503 : 502 });
  }
  let facts = null;
  if (params.get("facts") === "true") {
    try {
      facts = await syncSecCompanyFacts(resolvedCik);
    } catch (error) {
      const diagnostics = describeError(error);
      return NextResponse.json({ ok: false, stage: isSchemaError(error) ? "database_persist_xbrl" : "xbrl_fetch_or_persist", request: { ticker, cik: resolvedCik, facts: true }, mapping, submissions, facts: { ok: false, ...diagnostics }, ...diagnostics, checkedAt: new Date().toISOString() }, { status: isSchemaError(error) ? 503 : 502 });
    }
  }
  return NextResponse.json({ ok: submissions.ok && (facts == null || facts.ok), stage: "complete", request: { ticker, cik: resolvedCik, facts: Boolean(facts) }, mapping, submissions, facts, checkedAt: new Date().toISOString() });
}
