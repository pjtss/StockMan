export function getSmokeDeadlineMs(configuredDeadlineMs, perRequestTimeoutMs) {
  const configured = Number.isFinite(configuredDeadlineMs) && configuredDeadlineMs > 0 ? configuredDeadlineMs : 30_000;
  const perRequest = Number.isFinite(perRequestTimeoutMs) && perRequestTimeoutMs > 0 ? perRequestTimeoutMs : 15_000;
  return Math.max(configured, perRequest * 2 + 1_000);
}
