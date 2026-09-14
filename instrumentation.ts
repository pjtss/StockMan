/** Starts the intraday worker once with the Node.js application lifecycle. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV !== "production" || process.env.INTRADAY_DETECTION_ENABLED !== "true") return;
  // Keep the Node-only worker (pg/KIS dependencies) out of instrumentation's
  // edge-compatible bundle. It is loaded only after the runtime guard above.
  const loadModule = new Function("path", "return import(path)") as (path: string) => Promise<typeof import("@/lib/intraday-detection-worker")>;
  const { startIntradayDetectionWorker } = await loadModule("@/lib/intraday-detection-worker");
  startIntradayDetectionWorker(10_000);
}
