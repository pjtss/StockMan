export function getAutomationRunResultStatus(summary: Record<string, unknown>) {
  if (summary.counterDataInvalid === true || Number(summary.partialFailureCount ?? 0) > 0) {
    return { runStatus: "PARTIAL" as const, notificationStatus: "PARTIAL" as const };
  }
  const failureCount = Number(summary.failureCount ?? 0);
  const instrumentCount = Number(summary.instrumentCount ?? 0);
  if (failureCount === 0) return { runStatus: "SUCCESS" as const, notificationStatus: "SUCCESS" as const };
  const completelyFailed = instrumentCount > 0 && failureCount >= instrumentCount;
  const status = completelyFailed ? "FAILED" as const : "PARTIAL" as const;
  return { runStatus: status, notificationStatus: status };
}
