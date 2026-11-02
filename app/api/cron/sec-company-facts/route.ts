import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { withAutomationLock } from "@/lib/automation-lock";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { normalizeSecCiks } from "@/lib/sec-edgar-config";
import { loadSecCompanyTickerMaster } from "@/lib/sec-company-ticker";
import { filterActiveSecCommonStocks, filterEnabledSecCommonStocks } from "@/lib/sec-company-facts-eligibility";
import { syncSecCompanyTickerMaster } from "@/lib/sec-company-ticker-master-sync";
import { getSecCompanyFactsScheduleDecision } from "@/lib/sec-company-facts-schedule";
import { syncSecCompanyFacts } from "@/lib/sec-company-facts-sync";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    const settings = await loadFeatureModuleSettings("sec-company-facts");
    const now = new Date();
    const decision = getSecCompanyFactsScheduleDecision(settings, await loadLatestExecutedAutomationRun("sec-company-facts"), now);
    if (!decision.run) {
      await recordSkippedAutomationRun("sec-company-facts", decision.reason);
      return NextResponse.json({ ok: true, skipped: true, reason: decision.reason, checkedAt: now.toISOString(), timezone: "Asia/Seoul" });
    }

    const lockedResult = await withAutomationLock("sec-company-facts-daily", async () => {
      // Re-check after acquiring the process-independent DB lock.
      const latest = await loadLatestExecutedAutomationRun("sec-company-facts");
      const lockedDecision = getSecCompanyFactsScheduleDecision(settings, latest, new Date());
      if (!lockedDecision.run) return { skipped: true as const, reason: lockedDecision.reason };

      const configured = settings.featureSettings?.secCompanyFacts?.ciks;
      const ciks = normalizeSecCiks(configured?.length ? configured : process.env.SEC_SYNC_CIKS);

      const result = await withAutomationRun("sec-company-facts", async () => {
        const secTickerRows = await loadSecCompanyTickerMaster();
        if (!secTickerRows.length) throw new Error("SEC company ticker/exchange master returned no rows");
        const enabledCommonRows = await filterEnabledSecCommonStocks(secTickerRows);
        const companyMasterSync = await syncSecCompanyTickerMaster(secTickerRows, enabledCommonRows);
        const configuredCiks = new Set(ciks);
        const factCandidateRows = ciks.length ? secTickerRows.filter((row) => configuredCiks.has(row.cik)) : [];
        const eligibleTickers = factCandidateRows.length ? await filterActiveSecCommonStocks(factCandidateRows) : [];
        const eligibleCiks = [...new Set(eligibleTickers.map((row) => row.cik))];
        const results = [];
        for (const cik of eligibleCiks) {
          try {
            const item = await syncSecCompanyFacts(cik);
            results.push({ ...item, status: item.ok ? "SUCCESS" : "FAILED" });
          } catch (error) {
            results.push({ cik, ok: false, status: "FAILED", ...describeError(error) });
          }
        }
        const failureCount = results.filter((item) => !item.ok).length;
        return {
          ok: failureCount === 0,
          instrumentCount: eligibleCiks.length,
          failureCount,
          partialFailureCount: 0,
          configuredCikCount: ciks.length,
          eligibleCikCount: eligibleCiks.length,
          eligibleCommonTickerCount: eligibleTickers.length,
          excludedNonCommonOrInactiveCikCount: ciks.length - eligibleCiks.length,
          secCompanyMasterIssuerCount: companyMasterSync.issuerCount,
          secCompanyMasterTickerCount: companyMasterSync.tickerCount,
          secCompanyMasterSyncedAt: companyMasterSync.syncedAt,
          successCount: eligibleCiks.length - failureCount,
          results,
          timezone: "Asia/Seoul",
        };
      });
      return { skipped: false as const, result };
    });

    if (lockedResult === null) return NextResponse.json({ ok: true, skipped: true, reason: "already_running" });
    if (lockedResult.skipped) {
      await recordSkippedAutomationRun("sec-company-facts", lockedResult.reason);
      return NextResponse.json({ ok: true, ...lockedResult, checkedAt: new Date().toISOString(), timezone: "Asia/Seoul" });
    }
    return NextResponse.json(lockedResult.result);
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({ ok: false, stage: isSchemaError(error) ? "database" : "pipeline", ...diagnostics }, { status: isSchemaError(error) ? 503 : 500 });
  }
}
