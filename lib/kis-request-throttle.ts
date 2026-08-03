/** Serializes KIS calls in this process and backs off on gateway rate limits. */
const MIN_INTERVAL_MS = 250;
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

function isRateLimited(result: any) {
  const status = result?.response?.status ?? result?.status;
  const parsed = result?.parsed;
  const code = String(parsed?.msg_cd ?? parsed?.message ?? "");
  const message = String(parsed?.msg1 ?? parsed?.message ?? "");
  return status === 429 || code === "EGW00201" || /초당 거래건수|rate.?limit|too many requests/i.test(message);
}

export async function withKisRequestThrottle<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const release = await acquire();
    try {
      const result = await request();
      if (!isRateLimited(result) || attempt >= RETRY_DELAYS_MS.length) return result;
      await sleep(RETRY_DELAYS_MS[attempt]);
      continue;
    } finally {
      release();
    }
  }
}
