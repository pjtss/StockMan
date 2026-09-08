import { createDebugContext, type DebugContext } from "@/lib/debug-context";
import { writeDebugLog } from "@/lib/debug-logger";

/** Serializes KIS calls in this process and backs off on gateway rate limits. */
// Keep the default at the documented live-account ceiling (TPS 18), while
// allowing operations to choose a more conservative fixed interval.
// 1000 / 18 = 55.56ms, so 56ms prevents rounding above the limit.
const BASE_INTERVAL_MS = Math.max(50, Number(process.env.KIS_MIN_REQUEST_INTERVAL_MS ?? 56) || 56);
const MAX_ADAPTIVE_INTERVAL_MS = 250;
const RATE_LIMIT_STEP_MS = 25;
let adaptiveIntervalMs = BASE_INTERVAL_MS;
let consecutiveSuccesses = 0;
const RETRY_DELAYS_MS = [500, 1000, 2000];
let tail: Promise<void> = Promise.resolve();
let lastStartedAt = 0;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function acquire() {
  const previous = tail;
  let release!: () => void;
  tail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const wait = Math.max(0, adaptiveIntervalMs - (Date.now() - lastStartedAt));
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
  // KIS는 HTTP 200에서도 업무 오류를 rt_cd로 반환할 수 있다.
  // 이를 성공으로 분류하면 호출 로그·재처리 판단이 왜곡된다.
  if (parsed?.rt_cd != null && String(parsed.rt_cd) !== "0") return "PERMANENT";
  // HTTP 성공 코드라도 KIS 응답은 JSON이어야 한다. HTML/깨진 응답을
  // 성공으로 남기면 캐시 적재와 장애 분석이 모두 오염될 수 있다.
  if (result?.rawText && parsed == null) return "PERMANENT";
  return null;
}

export async function withKisRequestThrottle<T>(request: () => Promise<T>, context?: DebugContext): Promise<T> {
  const trace = context ?? createDebugContext({ feature: "kis-api" });
  for (let attempt = 0; ; attempt += 1) {
    const attemptStartedAt = Date.now();
    const release = await acquire();
    let released = false;
    try {
      const result = await request();
      const failure = classifyKisFailure(result);
      if (failure === "RATE_LIMITED") {
        adaptiveIntervalMs = Math.min(MAX_ADAPTIVE_INTERVAL_MS, adaptiveIntervalMs + RATE_LIMIT_STEP_MS);
        consecutiveSuccesses = 0;
      } else if (!failure) {
        consecutiveSuccesses += 1;
        if (consecutiveSuccesses >= 25 && adaptiveIntervalMs > BASE_INTERVAL_MS) {
          adaptiveIntervalMs = Math.max(BASE_INTERVAL_MS, adaptiveIntervalMs - 1);
          consecutiveSuccesses = 0;
        }
      }
      if (!(failure === "RATE_LIMITED" || failure === "TRANSIENT_HTTP") || attempt >= RETRY_DELAYS_MS.length) return result;
      writeDebugLog("WARN", "kis_api_retry_scheduled", trace, { attempt: attempt + 1, failure, delayMs: RETRY_DELAYS_MS[attempt], durationMs: Date.now() - attemptStartedAt, retryable: true });
      release();
      released = true;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    } catch (error) {
      if (attempt >= RETRY_DELAYS_MS.length) throw error;
      writeDebugLog("WARN", "kis_api_retry_scheduled", trace, { attempt: attempt + 1, failure: "NETWORK", delayMs: RETRY_DELAYS_MS[attempt], durationMs: Date.now() - attemptStartedAt, retryable: true, error: error instanceof Error ? error.message : String(error) });
      release();
      released = true;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    } finally {
      if (!released) release();
    }
  }
}
