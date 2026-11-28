/** Starts Node-only background work with the application server lifecycle. */
export async function register() {
  if (process.env.NODE_ENV !== "production") return;

  void (async () => {
    try {
      const { warmPublicDailyExportUniverse } = await import("./lib/public-daily-export");
      // Warm one market at a time so startup does not issue two large master scans concurrently.
      for (const market of ["KR", "US"] as const) {
        try {
          const result = await warmPublicDailyExportUniverse(market);
          console.info(`[Startup] public daily export universe warm complete (${market})`, result);
        } catch (error) {
          console.warn(`[Startup] public daily export universe warm failed (${market})`, error instanceof Error ? error.message : "unknown error");
        }
      }
    } catch (error) {
      console.warn("[Startup] public daily export universe warm could not start", error instanceof Error ? error.message : "unknown error");
    }
  })();

  if (process.env.INTRADAY_DETECTION_ENABLED === "false") return;

  const { startIntradayDetectionWorker } = await import("./lib/intraday-detection-worker");
  startIntradayDetectionWorker();
}
