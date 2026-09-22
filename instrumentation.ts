/** Starts the intraday worker once with the Node.js application lifecycle. */
export async function register() {
  // The intraday worker is started lazily by its server API route. Keeping
  // Node-only pg/KIS dependencies out of this hook is required for the
  // standalone build: importing the worker here makes Next bundle Node core
  // modules into the instrumentation target and can abort server startup.
  // The route-level ensure function is process-singleton and preserves the
  // explicit `INTRADAY_DETECTION_ENABLED=false` kill switch.
}
