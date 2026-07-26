const ALPACA_TIMEOUT_MS = 8_000;
const ALPACA_MAX_RETRIES = 2;

export class AlpacaApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "AlpacaApiError";
  }
}

function getConfig() {
  const key = process.env.ALPACA_API_KEY?.trim();
  const secret = process.env.ALPACA_API_SECRET?.trim();
  if (!key || !secret) throw new AlpacaApiError(500, "ALPACA_NOT_CONFIGURED", "Alpaca API 환경변수가 설정되지 않았습니다.");
  return { key, secret, baseUrl: (process.env.ALPACA_API_BASE_URL || "https://api.alpaca.markets").replace(/\/$/, "") };
}

export async function alpacaGet<T>(path: string, query?: Record<string, string>) {
  const config = getConfig();
  const url = new URL(`${config.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query || {})) url.searchParams.set(key, value);
  let lastError: unknown;
  for (let attempt = 0; attempt <= ALPACA_MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(ALPACA_TIMEOUT_MS),
        headers: { "APCA-API-KEY-ID": config.key, "APCA-API-SECRET-KEY": config.secret, Accept: "application/json" },
      });
      const raw = await response.text();
      let body: any = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      if (response.ok) return body as T;
      const retryable = response.status === 429 || response.status >= 500;
      lastError = new AlpacaApiError(response.status, body?.code || `HTTP_${response.status}`, body?.message || `Alpaca API HTTP ${response.status}`);
      if (!retryable || attempt === ALPACA_MAX_RETRIES) throw lastError;
    } catch (error) {
      lastError = error;
      if (error instanceof AlpacaApiError && error.status < 500 && error.status !== 429) throw error;
      if (attempt === ALPACA_MAX_RETRIES) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 500 : 1500));
  }
  throw lastError instanceof Error ? lastError : new Error("Alpaca API request failed");
}
