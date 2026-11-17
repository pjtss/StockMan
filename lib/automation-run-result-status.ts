export function getAutomationRunResultStatus(summary: Record<string, unknown>) {
  const count = (value: unknown) => {
    if (value == null) return { value: 0, valid: true };
    if (typeof value !== "number" && typeof value !== "string") return { value: 0, valid: false };
    const normalized = typeof value === "string" ? value.trim() : value;
    if (typeof normalized === "string" && !/^\d+$/.test(normalized)) return { value: 0, valid: false };
    const parsed = Number(normalized);
    const valid = Number.isSafeInteger(parsed) && parsed >= 0;
    return { value: valid ? parsed : 0, valid };
  };
  if (summary.status === "FAILED") {
    return { runStatus: "FAILED" as const, notificationStatus: "FAILED" as const };
  }
  const failure = count(summary.failureCount);
  const instrument = count(summary.instrumentCount);
  const unattempted = count(summary.unattemptedCount);
  const partial = count(summary.partialFailureCount);
  const discordDeliveryFailed = Boolean(summary.discord && typeof summary.discord === "object" && (summary.discord as Record<string, unknown>).ok === false);
  const incomplete = summary.status === "PARTIAL" || summary.degraded === true || discordDeliveryFailed
    || summary.counterDataInvalid === true || partial.value > 0 || summary.ok === false || failure.value > 0 || unattempted.value > 0
    || !failure.valid || !instrument.valid || !unattempted.valid || !partial.valid;
  if (!incomplete) return { runStatus: "SUCCESS" as const, notificationStatus: "SUCCESS" as const };
  const completelyFailed = instrument.value > 0 && failure.value + unattempted.value >= instrument.value;
  const status = completelyFailed ? "FAILED" as const : "PARTIAL" as const;
  return { runStatus: status, notificationStatus: status };
}
