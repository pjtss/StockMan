import { runDartAutomation } from "./dart-automation";
import { isDartOpen } from "./scanner-hours";
import { runSecAutomation } from "./sec-automation";
import { loadFeatureModuleSettings } from "./feature-module-settings";
import { isWithinSchedule } from "./schedule-time";
import { withAutomationRun } from "./automation-run";

export type FilingSyncResult = {
  success: true;
  dart: unknown;
  sec: unknown;
};

export async function runFilingSync(): Promise<FilingSyncResult> {
  const loadSettings = async (key: "dart-realtime" | "sec-realtime") => {
    try {
      return await loadFeatureModuleSettings(key);
    } catch (error) {
      console.warn(`[FilingSync] feature settings unavailable for ${key}; using default settings`, error instanceof Error ? error.message : error);
      return { enabled: key !== "sec-realtime", startTime: "00:00", endTime: "23:59", cooldownSeconds: 60, activeDays: [0, 1, 2, 3, 4, 5, 6] };
    }
  };
  const dartSettings = await loadSettings("dart-realtime");
  const secSettings = await loadSettings("sec-realtime");
  const dartOpen = await isDartOpen();
  const dartInWindow = isWithinSchedule(dartSettings);
  const secInWindow = isWithinSchedule(secSettings);

  const dart = dartSettings.enabled && dartInWindow && dartOpen
    ? await withAutomationRun("dart-realtime", runDartAutomation)
    : {
        skipped: true,
        reason: !dartSettings.enabled
          ? "DART disabled by admin"
          : !dartInWindow || !dartOpen
          ? "DART disabled outside schedule"
          : "DART disabled outside schedule",
      };

  const sec = secSettings.enabled && secInWindow
    ? await withAutomationRun("sec-realtime", runSecAutomation)
    : {
        skipped: true,
        reason: !secSettings.enabled
          ? "SEC disabled by admin"
          : "SEC disabled outside schedule",
      };

  return { success: true, dart, sec };
}
