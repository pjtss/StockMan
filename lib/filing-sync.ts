import { loadAdminFeatureFlags } from "./admin-flags";
import { syncDartAlerts } from "./alerts";
import { isDartOpen } from "./scanner-hours";
import { runSecAutomation } from "./sec-automation";

export type FilingSyncResult = {
  success: true;
  dart: unknown;
  sec: unknown;
};

export async function runFilingSync(): Promise<FilingSyncResult> {
  const flags = await loadAdminFeatureFlags();

  const dart = flags.dart_realtime && (await isDartOpen())
    ? await syncDartAlerts()
    : {
        skipped: true,
        reason: flags.dart_realtime
          ? "DART disabled outside schedule"
          : "DART disabled by admin",
      };

  const sec = flags.sec_realtime
    ? await runSecAutomation()
    : { skipped: true, reason: "SEC disabled by admin" };

  return { success: true, dart, sec };
}
