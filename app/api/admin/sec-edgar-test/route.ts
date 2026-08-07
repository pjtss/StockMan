import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { resolveSecTicker } from "@/lib/sec-company-ticker";
import { syncSecCompany, syncSecCompanyFacts } from "@/lib/sec-edgar-repository";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const ticker = params.get("ticker")?.trim().toUpperCase() || "";
  const cik = params.get("cik")?.replace(/\D/g, "").padStart(10, "0") || "";
  if (!ticker && !cik) return NextResponse.json({ ok: false, error: "ticker 또는 cik이 필요합니다." }, { status: 400 });
  try {
    const mapping = ticker ? await resolveSecTicker(ticker) : null;
    const resolvedCik = cik || mapping?.cik || "";
    if (!resolvedCik) return NextResponse.json({ ok: false, error: `SEC CIK를 찾지 못했습니다: ${ticker}`, mapping }, { status: 404 });
    const submissions = await syncSecCompany(resolvedCik);
    const facts = params.get("facts") === "true" ? await syncSecCompanyFacts(resolvedCik) : null;
    return NextResponse.json({ ok: submissions.ok, request: { ticker, cik: resolvedCik, facts: Boolean(facts) }, mapping, submissions, facts, checkedAt: new Date().toISOString() });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
