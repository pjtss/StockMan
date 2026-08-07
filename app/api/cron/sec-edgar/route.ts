import { NextResponse } from "next/server";
import { analyzeSecSubmission, loadPendingSecEvents, loadRecentSecSubmissions, markSecEventDiscord, syncSecCompany, syncSecCompanyFacts } from "@/lib/sec-edgar-repository";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret")?.trim();
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const ciks = (process.env.SEC_SYNC_CIKS || "").split(",").map((value) => value.replace(/\D/g, "").padStart(10, "0")).filter((value) => value !== "0000000000");
  const results = [];
  for (const cik of ciks) { const submissions = await syncSecCompany(cik); const facts = process.env.SEC_SYNC_XBRL === "true" ? await syncSecCompanyFacts(cik) : null; results.push({ cik, submissions, facts }); }
  const webhook = process.env.SEC_DISCORD_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
  let sent = 0;
  if (webhook) {
    const [events, submissions] = await Promise.all([loadPendingSecEvents(Number(process.env.SEC_EDGAR_DISCORD_BATCH || 10)), loadRecentSecSubmissions(100)]);
    const byAccession = new Map(submissions.map((row) => [row.accession, row]));
    for (const event of events) {
      const filing = byAccession.get(event.accession); if (!filing) continue;
      const analysis = await analyzeSecSubmission(event.accession);
      const financing = analysis.ok ? analysis.financing : null;
      const insider = analysis.ok ? analysis.insider : null;
      const body = [`🚨 **SEC EDGAR 공시 이벤트**`, `Form ${filing.form} · ${filing.cik}`, `분류 ${event.category} · ${event.direction} · 점수 ${event.score}`, event.matchedTerms.length ? `근거 ${event.matchedTerms.join(", ")}` : "", financing?.detected ? `자금조달 ${financing.amountUsd ?? "금액 확인 불가"} · 희석위험 ${financing.dilutionRisk}` : "", insider?.detected ? `내부자 ${insider.action}` : "", filing.filingUrl].filter(Boolean).join("\n");
      try { const response = await fetch(`${webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: body }) }); if (!response.ok) throw new Error(`Discord HTTP ${response.status}`); await markSecEventDiscord(event.accession, "SENT"); sent++; } catch (error) { await markSecEventDiscord(event.accession, "FAILED", error instanceof Error ? error.message : String(error)); }
    }
  }
  return NextResponse.json({ ok: true, configuredCikCount: ciks.length, results, discordSent: sent, webhookConfigured: Boolean(webhook) });
}
