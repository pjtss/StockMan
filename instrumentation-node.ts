/** Starts Node-only background work with the application server lifecycle. */
export async function register() {
  if (process.env.NODE_ENV !== "production" || process.env.INTRADAY_DETECTION_ENABLED === "false") return;

  const { startIntradayDetectionWorker } = await import("./lib/intraday-detection-worker");
  startIntradayDetectionWorker();
}
