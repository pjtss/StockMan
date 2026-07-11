import { getPool } from "./db";

const TOKEN_ENDPOINT = "https://openapi.koreainvestment.com:9443/oauth2/tokenP";
const TOKEN_LOCK_KEY = "kis-access-token";
const REFRESH_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

type StoredKisToken = {
  accessToken: string;
  issuedAt: Date;
  expiresAt: Date;
};

type TokenResponse = {
  access_token?: unknown;
  expires_in?: unknown;
  access_token_token_expired?: unknown;
};

let cachedToken: StoredKisToken | null = null;
let tokenRequestPromise: Promise<string | null> | null = null;

function toDate(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function getKstDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function canReuseToken(token: StoredKisToken, now: Date) {
  const expiresAt = token.expiresAt.getTime();
  if (expiresAt <= now.getTime()) return false;
  if (expiresAt > now.getTime() + REFRESH_WINDOW_MS) return true;

  // KIS is a one-issuance-per-day service. Keep today's token until expiry.
  return getKstDateKey(token.issuedAt) === getKstDateKey(now);
}

async function readStoredToken(query: (sql: string, values?: unknown[]) => Promise<any>) {
  const result = await query(
    `
      SELECT access_token, issued_at, expires_at
      FROM kis_tokens
      WHERE id = 1
      LIMIT 1
    `,
  );
  const row = result.rows?.[0];
  const issuedAt = toDate(row?.issued_at);
  const expiresAt = toDate(row?.expires_at);
  if (!row?.access_token || !issuedAt || !expiresAt) return null;

  return {
    accessToken: String(row.access_token),
    issuedAt,
    expiresAt,
  } satisfies StoredKisToken;
}

function parseExplicitExpiration(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const text = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)
    ? `${text.replace(" ", "T")}+09:00`
    : text;
  return toDate(normalized);
}

function resolveExpiration(payload: TokenResponse, issuedAt: Date) {
  const explicit = parseExplicitExpiration(payload.access_token_token_expired);
  if (explicit && explicit.getTime() > issuedAt.getTime()) return explicit;

  const expiresInSeconds = Number(payload.expires_in);
  if (Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return new Date(issuedAt.getTime() + expiresInSeconds * 1000);
  }

  return new Date(issuedAt.getTime() + DEFAULT_TOKEN_LIFETIME_MS);
}

async function requestNewToken(): Promise<StoredKisToken | null> {
  const appKey = process.env.KIS_APPKEY?.trim();
  const appSecret = process.env.KIS_APPSECRET?.trim();
  if (!appKey || !appSecret) return null;

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: appKey,
      appsecret: appSecret,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    console.warn(`[KIS] Token issuance failed with HTTP ${response.status}: ${responseText}`);
    return null;
  }

  const payload = (await response.json()) as TokenResponse;
  const accessToken = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) return null;

  const issuedAt = new Date();
  return {
    accessToken,
    issuedAt,
    expiresAt: resolveExpiration(payload, issuedAt),
  };
}

async function loadOrIssueToken() {
  let pool: ReturnType<typeof getPool>;
  try {
    pool = getPool();
    const stored = await readStoredToken((sql, values) => pool.query(sql, values));
    if (stored && canReuseToken(stored, new Date())) {
      cachedToken = stored;
      return stored.accessToken;
    }
  } catch (error) {
    console.warn("[KIS] DB token lookup failed; token issuance was blocked:", error);
    return null;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [TOKEN_LOCK_KEY]);

    const storedAfterLock = await readStoredToken((sql, values) => client.query(sql, values));
    if (storedAfterLock && canReuseToken(storedAfterLock, new Date())) {
      await client.query("COMMIT");
      cachedToken = storedAfterLock;
      return storedAfterLock.accessToken;
    }

    const issued = await requestNewToken();
    if (!issued) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `
        INSERT INTO kis_tokens (id, access_token, issued_at, expires_at)
        VALUES (1, $1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          access_token = EXCLUDED.access_token,
          issued_at = EXCLUDED.issued_at,
          expires_at = EXCLUDED.expires_at
      `,
      [issued.accessToken, issued.issuedAt, issued.expiresAt],
    );
    await client.query("COMMIT");

    cachedToken = issued;
    console.info("[KIS] Access token issued and persisted:", {
      issuedAt: issued.issuedAt.toISOString(),
      expiresAt: issued.expiresAt.toISOString(),
    });
    return issued.accessToken;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.warn("[KIS] Token lifecycle failed:", error);
    return null;
  } finally {
    client.release();
  }
}

export async function getAccessToken(): Promise<string | null> {
  const now = new Date();
  if (cachedToken && canReuseToken(cachedToken, now)) {
    return cachedToken.accessToken;
  }

  if (!tokenRequestPromise) {
    tokenRequestPromise = loadOrIssueToken().finally(() => {
      tokenRequestPromise = null;
    });
  }
  return tokenRequestPromise;
}

export async function refreshAccessToken(): Promise<string | null> {
  cachedToken = null;
  return getAccessToken();
}

export async function clearTokenCache() {
  cachedToken = null;
  tokenRequestPromise = null;

  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [TOKEN_LOCK_KEY]);
    await client.query("DELETE FROM kis_tokens WHERE id = 1");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.warn("[KIS] DB token cache clear failed:", error);
  } finally {
    client.release();
  }
}
