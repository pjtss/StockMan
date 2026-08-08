import { NextResponse } from "next/server";
import { analyzeSecSubmission, loadPendingSecEvents, loadRecentSecSubmissions, markSecEventDiscord, syncSecCompany, syncSecCompanyFacts } from "@/lib/sec-edgar-repository";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { resolveSecEdgarRuntimeConfig } from "@/lib/sec-edgar-config";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";

export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret")?.trim();
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const settings = await loadFeatureModuleSettings("sec-realtime");
    if (!settings.enabled) { await recordSkippedAutomationRun("sec-realtime", "disabled"); return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "disabled" }); }
    if (!isWithinSchedule(settings, new Date())) { await recordSkippedAutomationRun("sec-realtime", "outside_schedule"); return NextResponse.json({ ok: true, mode: "COMMIT", skipped: true, reason: "outside_schedule" }); }
    const result = await withAutomationRun("sec-realtime", async () => {
      const { ciks, syncXbrl, discordBatch } = resolveSecEdgarRuntimeConfig(settings.featureSettings);
      const results = [];
      for (const cik of ciks) {
        try {
          const submissions = await syncSecCompany(cik);
          const facts = syncXbrl ? await syncSecCompanyFacts(cik) : null;
          results.push({ cik, ok: submissions.ok && (facts == null || facts.ok), submissions, facts });
        } catch (error) {
          const diagnostics = describeError(error);
          results.push({ cik, ok: false, ...diagnostics });
        }
      }
      const webhook = await loadFeatureDiscordWebhook("sec-realtime", ["SEC_DISCORD_WEBHOOK_URL"]);
      let sent = 0;
      if (webhook) {
        const [events, submissions] = await Promise.all([loadPendingSecEvents(discordBatch), loadRecentSecSubmissions(100)]);
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
      return { ok: true, mode: "COMMIT", configuredCikCount: ciks.length, syncXbrl, discordBatch, results, failedCikCount: results.filter((item) => !item.ok).length, discordSent: sent, webhookConfigured: Boolean(webhook) };
    });
    return NextResponse.json(result);
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, mode: "COMMIT", stage: diagnostics.errorCode === "SCHEMA_TABLE_MISSING" ? "load_feature_settings" : "pipeline", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
