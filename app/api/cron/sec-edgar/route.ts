import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { analyzeSecSubmission, collectMissingSecCompanyDocuments, loadPendingSecEvents, loadPendingSecRssIssuerCandidates, loadRecentSecSubmissions, markSecEventDiscord, retryFailedSecCodexAnalyses, syncSecCompany, syncSecCompanyFacts, syncSecRssCandidateSubmissions } from "@/lib/sec-edgar-repository";
import { withAutomationRun } from "@/lib/automation-run";
import { loadFeatureDiscordWebhook } from "@/lib/discord-config";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { isWithinSchedule } from "@/lib/schedule-time";
import { resolveSecEdgarRuntimeConfig } from "@/lib/sec-edgar-config";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { loadSecSmallcapTickerTargets } from "@/lib/sec-smallcap-universe";
import { classifyStockmanEventError, materializeStockmanSecEvents } from "@/lib/stockman-events";

async function runSecRssCandidateSync(excludedCiks: string[] = []) {
  return withAutomationRun("sec-edgar", async () => {
    let pendingCandidates: Array<{ cik: string; accessions: string[] }>;
    try {
      pendingCandidates = await loadPendingSecRssIssuerCandidates(Number(process.env.SEC_RSS_SYNC_CIK_LIMIT || 10));
    } catch (error) {
      return {
        ok: false,
        mode: "COMMIT",
        submissionCoverage: { candidateLookupOk: false, candidateCikCount: 0, rssOnlyCikCount: 0, fetchSuccessCikCount: 0, fetchFailureCikCount: 0, unmatchedAccessionCount: 0, submissionCount: 0, insertedSubmissionCount: 0 },
        results: [],
        failedCikCount: 0,
        errorCode: describeError(error).errorCode,
      };
    }
    const configuredSet = new Set(excludedCiks);
    const rssCandidates = pendingCandidates.filter((candidate) => !configuredSet.has(candidate.cik));
    const results = [];
    for (const candidate of rssCandidates) {
      try {
        const submissions = await syncSecRssCandidateSubmissions(candidate.cik, candidate.accessions);
        results.push({ cik: candidate.cik, scope: "SEC_RSS_CANDIDATE", ok: submissions.ok && submissions.unmatchedAccessions.length === 0, submissions });
      } catch (error) {
        results.push({ cik: candidate.cik, scope: "SEC_RSS_CANDIDATE", ok: false, ...describeError(error) });
      }
    }
    let eventLedger: Awaited<ReturnType<typeof materializeStockmanSecEvents>> | { status: "FAILED"; errorCode: string };
    try { eventLedger = await materializeStockmanSecEvents(500, undefined, [...new Set(rssCandidates.flatMap((candidate) => candidate.accessions))]); }
    catch (error) { eventLedger = { status: "FAILED", errorCode: classifyStockmanEventError(error) }; }
    const successful = results.filter((item) => item.ok && "submissions" in item);
    const failedCikCount = results.length - successful.length;
    const unmatchedAccessionCount = results.reduce((sum, item) => sum + ("submissions" in item ? item.submissions?.unmatchedAccessions.length ?? 0 : 0), 0);
    return {
      ok: failedCikCount === 0 && eventLedger.status !== "FAILED" && eventLedger.status !== "PARTIAL_SUCCESS",
      mode: "COMMIT",
      submissionCoverage: {
        candidateLookupOk: true,
        candidateCikCount: pendingCandidates.length,
        rssOnlyCikCount: rssCandidates.length,
        fetchSuccessCikCount: successful.length,
        fetchFailureCikCount: failedCikCount,
        unmatchedAccessionCount,
        submissionCount: successful.reduce((sum, item) => sum + Number("submissions" in item ? item.submissions?.submissions || 0 : 0), 0),
        insertedSubmissionCount: successful.reduce((sum, item) => sum + Number("submissions" in item ? item.submissions?.inserted || 0 : 0), 0),
      },
      results,
      failedCikCount,
      eventLedger,
      degraded: eventLedger.status === "FAILED" || eventLedger.status === "PARTIAL_SUCCESS",
    };
  });
}

type SecRssCandidateRun = Awaited<ReturnType<typeof runSecRssCandidateSync>> | { ok: true; skipped: true; reason: string } | { ok: false; errorCode: string };

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const [settings, rssSettings] = await Promise.all([loadFeatureModuleSettings("sec-realtime"), loadFeatureModuleSettings("sec-edgar")]);
    const realtimeActive = settings.enabled && isWithinSchedule(settings, new Date());
    const runtime = resolveSecEdgarRuntimeConfig(settings.featureSettings);
    const smallcapTargets = realtimeActive && runtime.smallcapUniverse ? await loadSecSmallcapTickerTargets() : [];
    const configuredCiks = realtimeActive ? (runtime.smallcapUniverse ? [...new Set(smallcapTargets.map((target) => target.cik))] : runtime.ciks) : [];
    let rssCandidateRun: SecRssCandidateRun;
    if (!rssSettings.enabled) {
      await recordSkippedAutomationRun("sec-edgar", "disabled");
      rssCandidateRun = { ok: true, skipped: true, reason: "disabled" };
    } else if (!isWithinSchedule(rssSettings, new Date())) {
      await recordSkippedAutomationRun("sec-edgar", "outside_schedule");
      rssCandidateRun = { ok: true, skipped: true, reason: "outside_schedule" };
    } else {
      try { rssCandidateRun = await runSecRssCandidateSync(configuredCiks); }
      catch (error) { rssCandidateRun = { ok: false, errorCode: describeError(error).errorCode }; }
    }
    if (!settings.enabled) {
      await recordSkippedAutomationRun("sec-realtime", "disabled");
      const skipped = { ok: true, mode: "COMMIT", skipped: true, reason: "disabled" };
      return NextResponse.json({ ...("skipped" in rssCandidateRun && rssCandidateRun.skipped ? skipped : { ok: rssCandidateRun.ok, mode: "COMMIT" }), secRealtime: skipped, secEdgar: rssCandidateRun, ...(!rssCandidateRun.ok && "errorCode" in rssCandidateRun ? { errorCode: rssCandidateRun.errorCode } : {}) }, { status: rssCandidateRun.ok ? 200 : 503 });
    }
    if (!realtimeActive) {
      await recordSkippedAutomationRun("sec-realtime", "outside_schedule");
      const skipped = { ok: true, mode: "COMMIT", skipped: true, reason: "outside_schedule" };
      return NextResponse.json({ ...("skipped" in rssCandidateRun && rssCandidateRun.skipped ? skipped : { ok: rssCandidateRun.ok, mode: "COMMIT" }), secRealtime: skipped, secEdgar: rssCandidateRun, ...(!rssCandidateRun.ok && "errorCode" in rssCandidateRun ? { errorCode: rssCandidateRun.errorCode } : {}) }, { status: rssCandidateRun.ok ? 200 : 503 });
    }
    const result = await withAutomationRun("sec-realtime", async () => {
      const analysisRetries = await retryFailedSecCodexAnalyses();
      const ciks = configuredCiks;
      const { syncXbrl, discordBatch } = runtime;
      const results = [];
      for (const cik of ciks) {
        try {
          const submissions = await syncSecCompany(cik);
          const facts = syncXbrl ? await syncSecCompanyFacts(cik) : null;
          const documents = submissions.ok ? await collectMissingSecCompanyDocuments(cik) : null;
          results.push({ cik, scope: "CONFIGURED", ok: submissions.ok && (facts == null || facts.ok) && (documents == null || documents.failed.length === 0), submissions, facts, documents });
        } catch (error) {
          const diagnostics = describeError(error);
          results.push({ cik, scope: "CONFIGURED", ok: false, ...diagnostics });
        }
      }
      let eventLedger: Awaited<ReturnType<typeof materializeStockmanSecEvents>> | { status: "FAILED"; errorCode: string };
      try { eventLedger = await materializeStockmanSecEvents(); }
      catch (error) { eventLedger = { status: "FAILED", errorCode: classifyStockmanEventError(error) }; }
      const webhook = await loadFeatureDiscordWebhook("sec-realtime", ["SEC_DISCORD_WEBHOOK_URL"]);
      let sent = 0;
      let documentCaptured = 0;
      let documentCaptureFailed = 0;
      const [events, submissions] = await Promise.all([loadPendingSecEvents(discordBatch), loadRecentSecSubmissions(100)]);
      const byAccession = new Map(submissions.map((row) => [row.accession, row]));
      for (const event of events) {
        const filing = byAccession.get(event.accession); if (!filing) continue;
        const analysis = await analyzeSecSubmission(event.accession);
        if (analysis.ok) documentCaptured++;
        else documentCaptureFailed++;
        if (!webhook || !analysis.ok) continue;
        const financing = analysis.financing;
        const insider = analysis.insider;
        const body = [`🚨 **SEC EDGAR 공시 이벤트**`, `Form ${filing.form} · ${filing.cik}`, `분류 ${event.category} · ${event.direction} · 점수 ${event.score}`, event.matchedTerms.length ? `근거 ${event.matchedTerms.join(", ")}` : "", financing?.detected ? `자금조달 ${financing.amountUsd ?? "금액 확인 불가"} · 희석위험 ${financing.dilutionRisk}` : "", insider?.detected ? `내부자 ${insider.action}` : "", filing.filingUrl].filter(Boolean).join("\n");
        try { const response = await fetch(`${webhook}?wait=true`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: body, allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(8_000) }); if (!response.ok) throw new Error(`Discord HTTP ${response.status}`); await markSecEventDiscord(event.accession, "SENT"); sent++; } catch (error) { await markSecEventDiscord(event.accession, "FAILED", error instanceof Error ? error.message : String(error)); }
      }
      const successfulFetches = results.filter((item) => item.submissions && typeof item.submissions === "object" && item.submissions.ok === true);
      const failedFetches = results.length - successfulFetches.length;
      const submissionCoverage = {
        configuredCikCount: configuredCiks.length,
        fetchSuccessCikCount: successfulFetches.length,
        fetchFailureCikCount: failedFetches,
        submissionCount: successfulFetches.reduce((sum, item) => sum + Number(item.submissions?.submissions || 0), 0),
        insertedSubmissionCount: successfulFetches.reduce((sum, item) => sum + Number(item.submissions?.inserted || 0), 0),
      };
      return { ok: true, mode: "COMMIT", configuredCikCount: configuredCiks.length, submissionCoverage, smallcapUniverse: runtime.smallcapUniverse, syncXbrl, discordBatch, analysisRetries, results, failedCikCount: results.filter((item) => !item.ok).length, documentCaptured, documentCaptureFailed, discordSent: sent, webhookConfigured: Boolean(webhook), eventLedger, degraded: eventLedger.status === "FAILED" || eventLedger.status === "PARTIAL_SUCCESS" };
    });
    return NextResponse.json({ ...result, ok: result.ok && rssCandidateRun.ok, secEdgar: rssCandidateRun, ...(!rssCandidateRun.ok && "errorCode" in rssCandidateRun ? { errorCode: rssCandidateRun.errorCode } : {}) }, { status: result.failedCikCount > 0 || !rssCandidateRun.ok ? 503 : 200 });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, mode: "COMMIT", stage: diagnostics.errorCode === "SCHEMA_TABLE_MISSING" ? "load_feature_settings" : "pipeline", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
