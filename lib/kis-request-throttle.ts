import { createDebugContext, type DebugContext } from "@/lib/debug-context";
import { writeDebugLog } from "@/lib/debug-logger";

// KIS may document a higher ceiling, but this application deliberately uses
// a conservative hard ceiling of 10 requests per rolling second.
const MAX_SAFE_TPS = 10;
const MIN_SAFE_INTERVAL_MS = 1000 / MAX_SAFE_TPS;
const configuredIntervalMs = Number(process.env.KIS_MIN_REQUEST_INTERVAL_MS ?? MIN_SAFE_INTERVAL_MS) || MIN_SAFE_INTERVAL_MS;
const BASE_INTERVAL_MS = Math.max(MIN_SAFE_INTERVAL_MS, configuredIntervalMs);
const MAX_ADAPTIVE_INTERVAL_MS = 250;
const RATE_LIMIT_STEP_MS = 25;
const MAX_IN_FLIGHT = 10;
const MAX_QUEUED_REQUESTS = 512;
const RETRY_DELAYS_MS = [500, 1000, 2000];

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function classifyKisFailure(result: any): "RATE_LIMITED" | "TRANSIENT_HTTP" | "AUTH_EXPIRED" | "PERMANENT" | null {
  const status = result?.response?.status ?? result?.status;
  const parsed = result?.parsed;
  const code = String(parsed?.msg_cd ?? parsed?.message ?? "");
  const message = String(parsed?.msg1 ?? parsed?.message ?? "");
  if (status === 401 || code === "EGW00123" || /인증|access.?token|unauthori[sz]ed/i.test(message)) return "AUTH_EXPIRED";
  if (status === 429 || code === "EGW00201" || /초당 거래건수|rate.?limit|too many requests/i.test(message)) return "RATE_LIMITED";
  if (status === 500 || status === 502 || status === 503 || status === 504) return "TRANSIENT_HTTP";
  if (status >= 400) return "PERMANENT";
  // KIS는 HTTP 200에서도 업무 오류를 rt_cd로 반환할 수 있다.
  // 이를 성공으로 분류하면 호출 로그·재처리 판단이 왜곡된다.
  if (parsed?.rt_cd != null && String(parsed.rt_cd) !== "0") return "PERMANENT";
  // HTTP 성공 코드라도 KIS 응답은 JSON이어야 한다. HTML/깨진 응답을
  // 성공으로 남기면 캐시 적재와 장애 분석이 모두 오염될 수 있다.
  if (result?.rawText && parsed == null) return "PERMANENT";
  return null;
}

type ThrottleOptions = {
  baseIntervalMs: number;
  maxInFlight?: number;
  maxQueuedRequests?: number;
  retryDelaysMs?: number[];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  onStartReservation?: (startedAt: number) => void;
  logRetry?: (trace: DebugContext, payload: Record<string, unknown>) => void;
};

/**
 * Creates a process-local KIS request scheduler. It serializes start-time
 * reservations, not network waits, and independently caps in-flight requests.
 */
export function createKisRequestThrottle(options: ThrottleOptions) {
  const now = options.now ?? Date.now;
  const wait = options.sleep ?? sleep;
  const retryDelays = options.retryDelaysMs ?? RETRY_DELAYS_MS;
  const maxInFlight = Math.max(1, Math.floor(options.maxInFlight ?? MAX_IN_FLIGHT));
  const maxQueuedRequests = Math.max(0, Math.floor(options.maxQueuedRequests ?? MAX_QUEUED_REQUESTS));
  const baseIntervalMs = Math.max(MIN_SAFE_INTERVAL_MS, options.baseIntervalMs);
  const adaptiveIntervalCeilingMs = Math.max(baseIntervalMs, MAX_ADAPTIVE_INTERVAL_MS);
  let adaptiveIntervalMs = baseIntervalMs;
  let consecutiveSuccesses = 0;
  let startGate: Promise<void> = Promise.resolve();
  let lastStartedAt = 0;
  let recentStarts: number[] = [];
  let pauseUntil = 0;
  let inFlight = 0;
  const inFlightWaiters: Array<() => void> = [];

  function applySharedBackoff(backoffMs: number) {
    pauseUntil = Math.max(pauseUntil, now() + backoffMs);
    adaptiveIntervalMs = Math.min(adaptiveIntervalCeilingMs, adaptiveIntervalMs + RATE_LIMIT_STEP_MS);
    consecutiveSuccesses = 0;
  }

  async function acquireInFlightSlot() {
    if (inFlight < maxInFlight) {
      inFlight += 1;
    } else {
      if (inFlightWaiters.length >= maxQueuedRequests) throw new Error("KIS_REQUEST_QUEUE_FULL");
      await new Promise<void>((resolve) => inFlightWaiters.push(resolve));
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = inFlightWaiters.shift();
      if (next) next();
      else inFlight -= 1;
    };
  }

  async function reserveRequestStart() {
    const previous = startGate;
    let unlock!: () => void;
    startGate = new Promise<void>((resolve) => { unlock = resolve; });
    await previous;
    try {
      while (true) {
        const currentTime = now();
        recentStarts = recentStarts.filter((startedAt) => currentTime - startedAt < 1000);
        const spacingWait = Math.max(0, adaptiveIntervalMs - (currentTime - lastStartedAt));
        const cooldownWait = Math.max(0, pauseUntil - currentTime);
        const rollingWindowWait = recentStarts.length >= MAX_SAFE_TPS
          ? Math.max(0, recentStarts[0] + 1000 - currentTime + 1)
          : 0;
        const delay = Math.max(spacingWait, cooldownWait, rollingWindowWait);
        if (delay > 0) {
          await wait(delay);
          continue;
        }
        const startedAt = now();
        recentStarts.push(startedAt);
        lastStartedAt = startedAt;
        options.onStartReservation?.(startedAt);
        return;
      }
    } finally {
      unlock();
    }
  }

  return async function withThrottle<T>(
    request: () => Promise<T>,
    context?: DebugContext,
    onRateLimit?: (result: T, attempt: number, backoffMs: number) => void,
    onAttempt?: (attempt: number) => void,
  ): Promise<T> {
    const trace = context ?? createDebugContext({ feature: "kis-api" });
    for (let attempt = 0; ; attempt += 1) {
      const attemptStartedAt = now();
      const releaseInFlight = await acquireInFlightSlot();
      try {
        await reserveRequestStart();
      } catch (error) {
        releaseInFlight();
        try { onAttempt?.(attempt + 1); } catch { /* Observability hooks cannot alter request delivery. */ }
        throw error;
      }

      let result: T;
      try {
        result = await request();
      } catch (error) {
        releaseInFlight();
        // A rejected fetch is still a real HTTP attempt. Record it before
        // deciding whether it can be retried, and cool down queued callers as
        // well so a shared network outage does not create a retry burst.
        try { onAttempt?.(attempt + 1); } catch { /* Observability hooks cannot alter request delivery. */ }
        const delayMs = retryDelays[attempt] ?? retryDelays.at(-1) ?? 1000;
        applySharedBackoff(delayMs);
        if (attempt >= retryDelays.length) throw error;
        writeRetry(trace, { attempt: attempt + 1, failure: "NETWORK", delayMs, durationMs: now() - attemptStartedAt, retryable: true, error: error instanceof Error ? error.message : String(error) });
        await wait(delayMs);
        continue;
      }

      const failure = classifyKisFailure(result);
      try { onAttempt?.(attempt + 1); } catch { /* Observability hooks cannot alter request delivery. */ }
      if (failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP") {
        // Rate limits and upstream 5xx responses are process-wide pressure,
        // not isolated failures. Slow queued starts too, preventing each
        // concurrent request from retrying into the same unhealthy window.
        const backoffMs = retryDelays[attempt] ?? retryDelays.at(-1) ?? 1000;
        applySharedBackoff(backoffMs);
        if (failure === "RATE_LIMITED") {
          try { onRateLimit?.(result, attempt + 1, retryDelays[attempt] ?? 0); } catch { /* Observability hooks cannot alter request delivery. */ }
        }
      } else if (!failure) {
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= 25 && adaptiveIntervalMs > baseIntervalMs) {
          adaptiveIntervalMs = Math.max(baseIntervalMs, adaptiveIntervalMs - 1);
          consecutiveSuccesses = 0;
        }
      }

      const shouldRetry = (failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP") && attempt < retryDelays.length;
      releaseInFlight();
      if (!shouldRetry) return result;
      const delayMs = retryDelays[attempt];
      writeRetry(trace, { attempt: attempt + 1, failure, delayMs, durationMs: now() - attemptStartedAt, retryable: true });
      await wait(delayMs);
    }
  };

  function writeRetry(trace: DebugContext, payload: Record<string, unknown>) {
    if (options.logRetry) options.logRetry(trace, payload);
    else writeDebugLog("WARN", "kis_api_retry_scheduled", trace, payload);
  }
}

export const withKisRequestThrottle = createKisRequestThrottle({ baseIntervalMs: BASE_INTERVAL_MS });
