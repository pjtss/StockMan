import { NextResponse } from "next/server";
import { withAutomationRun } from "@/lib/automation-run";
import { loadLatestExecutedAutomationRun, recordSkippedAutomationRun } from "@/lib/automation-run-repository";
import { withAutomationLock } from "@/lib/automation-lock";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { normalizeSecCiks } from "@/lib/sec-edgar-config";
import { resolveSecCompanyTickers } from "@/lib/sec-company-ticker";
import { filterActiveSecCommonStocks } from "@/lib/sec-company-facts-eligibility";
import { getSecCompanyFactsScheduleDecision } from "@/lib/sec-company-facts-schedule";
import { syncSecCompanyFacts } from "@/lib/sec-company-facts-sync";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";

export const runtime = "nodejs";
export const maxDuration = 900;

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

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
      if (!ciks.length) return { skipped: true as const, reason: "no_configured_ciks" };

      const secTickerRows = await resolveSecCompanyTickers(ciks);
      const eligibleTickers = await filterActiveSecCommonStocks(secTickerRows);
      const eligibleCiks = [...new Set(eligibleTickers.map((row) => row.cik))];
      if (!eligibleCiks.length) return { skipped: true as const, reason: "no_active_common_stock_ciks", configuredCikCount: ciks.length, eligibleTickerCount: 0 };

      const result = await withAutomationRun("sec-company-facts", async () => {
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
