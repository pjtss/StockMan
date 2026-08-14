/** Serializes KIS calls in this process and backs off on gateway rate limits. */
// Keep the conservative default, but allow operations to tune latency without
// rebuilding the application. Never set this below the KIS account/API limit.
const MIN_INTERVAL_MS = Math.max(50, Number(process.env.KIS_MIN_REQUEST_INTERVAL_MS ?? 250) || 250);
const RETRY_DELAYS_MS = [500, 1000, 2000];
let tail: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function acquire() {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - lastStartedAt));
  if (wait) await sleep(wait);
  lastStartedAt = Date.now();
  return release;
}

export function classifyKisFailure(result: any): "RATE_LIMITED" | "TRANSIENT_HTTP" | "AUTH_EXPIRED" | "PERMANENT" | null {
  const status = result?.response?.status ?? result?.status;
  const parsed = result?.parsed;
  const code = String(parsed?.msg_cd ?? parsed?.message ?? "");
  const message = String(parsed?.msg1 ?? parsed?.message ?? "");
  if (status === 401 || code === "EGW00123" || /인증|access.?token|unauthori[sz]ed/i.test(message)) return "AUTH_EXPIRED";
  if (status === 429 || code === "EGW00201" || /초당 거래건수|rate.?limit|too many requests/i.test(message)) return "RATE_LIMITED";
  if (status === 500 || status === 502 || status === 503 || status === 504) return "TRANSIENT_HTTP";
  if (status >= 400) return "PERMANENT";
  return null;
}

export async function withKisRequestThrottle<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const release = await acquire();
    try {
      const result = await request();
      const failure = classifyKisFailure(result);
      if (!(failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP") || attempt >= RETRY_DELAYS_MS.length) return result;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    } finally {
      release();
    }
  }
}
