const SAFE_ERROR_CODES = /\b(EADDRINUSE|EACCES|EADDRNOTAVAIL|ECONNREFUSED|ETIMEDOUT)\b/g;

export function createRuntimeStartupSignalTracker(startedAt = Date.now()) {
  let tail = "";
  let nextReadyObservedMs = null;
  let startupErrorSeen = false;
  const errorCodes = new Set();

  return {
    accept(chunk, now = Date.now()) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      const output = tail + text;
      if (nextReadyObservedMs === null && /\bReady in\b/i.test(output)) {
        nextReadyObservedMs = Math.max(0, now - startedAt);
      }
      if (/Failed to start server|Error: listen/i.test(output)) startupErrorSeen = true;
      for (const match of output.matchAll(SAFE_ERROR_CODES)) errorCodes.add(match[1]);
      tail = output.slice(-128);
      return this.snapshot();
    },
    snapshot() {
      return { nextReadyObservedMs, startupErrorSeen, errorCodes: [...errorCodes] };
    },
  };
}
