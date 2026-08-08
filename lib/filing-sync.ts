import { runDartAutomation } from "./dart-automation";
import { isDartOpen } from "./scanner-hours";
import { loadFeatureModuleSettings } from "./feature-module-settings";
import { isWithinSchedule } from "./schedule-time";
import { withAutomationRun } from "./automation-run";
import { recordSkippedAutomationRun } from "./automation-run-repository";

export type FilingSyncResult = {
  success: true;
  dart: unknown;
  sec: unknown;
};

/** DART scheduler only; SEC jobs have independent cron owners. */
export async function runFilingSync(): Promise<FilingSyncResult> {
  const loadSettings = async () => {
    try {
      return await loadFeatureModuleSettings("dart-realtime");
    } catch (error) {
      console.warn("[FilingSync] DART feature settings unavailable; using default settings", error instanceof Error ? error.message : error);
      return { enabled: true, startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [0, 1, 2, 3, 4, 5, 6] };
    }
  };
  const dartSettings = await loadSettings();
  const dartOpen = await isDartOpen();
  const dartInWindow = isWithinSchedule(dartSettings);

  const dartSkippedReason = !dartSettings.enabled
    ? "disabled"
    : !dartInWindow || !dartOpen
      ? "outside_schedule"
      : "outside_schedule";
  const dart = dartSettings.enabled && dartInWindow && dartOpen
    ? await withAutomationRun("dart-realtime", runDartAutomation)
    : (await recordSkippedAutomationRun("dart-realtime", dartSkippedReason), { skipped: true, reason: dartSkippedReason });

  return {
    success: true,
    dart,
    sec: {
      skipped: true,
      reason: "SEC RSS is handled by market-rss; SEC Submissions by sec-edgar",
    },
  };
}
