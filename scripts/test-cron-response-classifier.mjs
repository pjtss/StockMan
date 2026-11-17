import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const bashCandidates = process.platform === "win32"
  ? [process.env.BASH, "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
  : ["bash"];
const bash = bashCandidates.find((candidate) => candidate && (path.isAbsolute(candidate) ? existsSync(candidate) : true));
if (!bash) throw new Error("Bash is required to verify the OCI cron response classifier");

const cronPath = path.resolve("scripts/oci-cron.sh").replaceAll("\\", "/").replaceAll("'", "'\\''");
const shell = `CRON_SCRIPT_SOURCE_ONLY=1
CRON_SECRET=test-secret
source '${cronPath}'
DEFERRED_ENDPOINT_COUNT=0
MOCK_CURL_STATUS=0
MOCK_CURL_OUTPUT='{"ok":true,"deferred":{"kis_realtime_events":true}}'
curl() { printf '%s' "$MOCK_CURL_OUTPUT"; return "$MOCK_CURL_STATUS"; }
run_cron_endpoint success-deferred 1 /test >/dev/null 2>&1
[[ "$SUCCESS_COUNT" == 1 && "$DEFERRED_ENDPOINT_COUNT" == 1 && "$FAILED_COUNT" == 0 ]] || exit 1
MOCK_CURL_OUTPUT='{"ok":true,"deferred":{"kis_realtime_events":false}}'
run_cron_endpoint success-clear 1 /test >/dev/null 2>&1
[[ "$SUCCESS_COUNT" == 2 && "$DEFERRED_ENDPOINT_COUNT" == 1 ]] || exit 2
MOCK_CURL_OUTPUT='{"skipped":true,"deferred":{"kis_realtime_events":true}}'
run_cron_endpoint skipped-deferred 1 /test >/dev/null 2>&1
[[ "$SKIPPED_COUNT" == 1 && "$DEFERRED_ENDPOINT_COUNT" == 2 ]] || exit 3
MOCK_CURL_STATUS=22
MOCK_CURL_OUTPUT='curl: (22) The requested URL returned error: 503 {"ok":false,"deferred":{"kis_realtime_events":true}} trailing transport diagnostic'
run_cron_endpoint http-failed-deferred 1 /test >/dev/null 2>&1
[[ "$FAILED_COUNT" == 1 && "$DEFERRED_ENDPOINT_COUNT" == 3 ]] || exit 4
MOCK_CURL_OUTPUT='curl: (22) The requested URL returned error: 503 {"ok":false}'
run_cron_endpoint http-failed-clear 1 /test >/dev/null 2>&1
[[ "$FAILED_COUNT" == 2 && "$DEFERRED_ENDPOINT_COUNT" == 3 ]] || exit 5
MOCK_CURL_STATUS=0
MOCK_CURL_OUTPUT='{"ok":false,"skipped":true,"deferred":{"kis_realtime_events":true}}'
run_cron_endpoint application-failed-deferred 1 /test >/dev/null 2>&1
[[ "$FAILED_COUNT" == 3 && "$SKIPPED_COUNT" == 1 && "$DEFERRED_ENDPOINT_COUNT" == 4 && "$TOTAL_COUNT" == 6 ]] || exit 6
summary="$(print_cron_summary 123)"
[[ "$summary" == '[CronSummary] total=6 success=2 failed=3 skipped=1 deferredEndpoints=4 elapsedMs=123' ]] || exit 7
`;
const result = spawnSync(bash, ["-c", shell], { encoding: "utf8" });
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Cron response classifier failed (${result.status}): ${result.stderr || result.stdout}`);
console.log("Cron response classifier OK (HTTP success/failure, application failure, skipped, deferred count, summary totals)");
