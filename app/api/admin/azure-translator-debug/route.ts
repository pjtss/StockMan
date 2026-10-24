import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { requireAdminSession } from "@/lib/admin-auth";
import { getPool } from "@/lib/db";
import { AzureTranslationClient } from "@/lib/azure-translation-client";
import { createQuotaAwareTranslationClient } from "@/lib/quota-aware-translation-client";
import {
  AZURE_TRANSLATION_HOURLY_LIMIT,
  AZURE_TRANSLATION_MONTHLY_LIMIT,
  AZURE_TRANSLATION_PROVIDER,
  GOOGLE_TRANSLATION_HOURLY_LIMIT,
  GOOGLE_TRANSLATION_PROVIDER,
  TRANSLATION_LIMIT,
} from "@/lib/translation-cache";
import { TranslationClientOperationError } from "@/lib/translation-types";

export const dynamic = "force-dynamic";

async function authorized(request: Request) {
  return (await requireAdminSession()) || isCronRequestAuthorized(request);
}

function getConfiguration() {
  const endpoint = process.env.AZURE_TRANSLATOR_ENDPOINT?.trim() || "";
  let endpointShape: { host: string; path: string; queryPresent: boolean; pathAlreadyContainsTranslate: boolean } | null = null;
  if (endpoint) {
    try {
      const parsed = new URL(endpoint);
      endpointShape = {
        host: parsed.host,
        path: parsed.pathname,
        queryPresent: Boolean(parsed.search),
        pathAlreadyContainsTranslate: /(?:^|\/)translate\/?$/i.test(parsed.pathname),
      };
    } catch { endpointShape = null; }
  }
  const keyConfigured = Boolean(process.env.AZURE_TRANSLATOR_API_KEY?.trim());
  const endpointConfigured = Boolean(endpoint);
  const f0Confirmed = process.env.AZURE_TRANSLATOR_FREE_TIER_CONFIRMED?.trim() === "F0";
  return {
    providerEnabled: keyConfigured && endpointConfigured && f0Confirmed,
    keyConfigured,
    endpointConfigured,
    endpointShape,
    regionConfigured: Boolean(process.env.AZURE_TRANSLATOR_REGION?.trim()),
    f0Confirmed,
    googleFallbackConfigured: Boolean(process.env.GOOGLE_TRANSLATION_API_KEY?.trim()),
  };
}

async function getQuotaSnapshot() {
  const usageMonth = new Date().toISOString().slice(0, 7);
  const pool = getPool();
  const providers = [
    { provider: AZURE_TRANSLATION_PROVIDER, monthlyLimit: AZURE_TRANSLATION_MONTHLY_LIMIT, hourlyLimit: AZURE_TRANSLATION_HOURLY_LIMIT },
    { provider: GOOGLE_TRANSLATION_PROVIDER, monthlyLimit: TRANSLATION_LIMIT, hourlyLimit: GOOGLE_TRANSLATION_HOURLY_LIMIT },
  ];
  const rows = await Promise.all(providers.map(async (limits) => {
    const [monthly, hourly] = await Promise.all([
      pool.query<{ reserved: string; translated: string; updatedAt: Date | null }>(
        `SELECT reserved_characters::text AS reserved, translated_characters::text AS translated, updated_at AS "updatedAt"
         FROM translation_usage_monthly WHERE provider=$1 AND usage_month=$2 LIMIT 1`,
        [limits.provider, usageMonth],
      ),
      pool.query<{ used: string }>(
        `SELECT COALESCE(SUM(character_count),0)::text AS used
         FROM translation_usage_reservations WHERE provider=$1 AND reserved_at > NOW()-INTERVAL '1 hour'`,
        [limits.provider],
      ),
    ]);
    const reserved = Number(monthly.rows[0]?.reserved ?? 0);
    const translated = Number(monthly.rows[0]?.translated ?? 0);
    const hourlyUsed = Number(hourly.rows[0]?.used ?? 0);
    return {
      provider: limits.provider,
      usageMonth,
      monthlyLimit: limits.monthlyLimit,
      monthlyReservedCharacters: reserved,
      monthlyTranslatedCharacters: translated,
      monthlyRemainingCharacters: Math.max(0, limits.monthlyLimit - reserved),
      hourlyLimit: limits.hourlyLimit,
      rollingHourReservedCharacters: hourlyUsed,
      rollingHourRemainingCharacters: Math.max(0, limits.hourlyLimit - hourlyUsed),
      updatedAt: monthly.rows[0]?.updatedAt ? new Date(monthly.rows[0].updatedAt).toISOString() : null,
    };
  }));
  return rows;
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  if (!(await authorized(request))) return response({ ok: false, error: "UNAUTHORIZED" }, 401);
  const checkedAt = new Date().toISOString();
  try {
    return response({
      ok: true,
      mode: "AZURE_TRANSLATOR_DIAGNOSTICS",
      checkedAt,
      configuration: getConfiguration(),
      quota: await getQuotaSnapshot(),
      liveTest: "not_run",
    });
  } catch {
    return response({
      ok: false,
      mode: "AZURE_TRANSLATOR_DIAGNOSTICS",
      checkedAt,
      configuration: getConfiguration(),
      error: "TRANSLATION_QUOTA_DIAGNOSTICS_UNAVAILABLE",
      liveTest: "not_run",
    }, 503);
  }
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  if (!(await authorized(request))) return response({ ok: false, requestId, error: "UNAUTHORIZED" }, 401);

  const configuration = getConfiguration();
  const provider = AzureTranslationClient.fromEnvironment();
  if (!provider) {
    return response({ ok: false, requestId, mode: "AZURE_TRANSLATOR_LIVE_TEST", checkedAt: new Date().toISOString(), configuration, error: "AZURE_TRANSLATOR_NOT_CONFIGURED" }, 409);
  }

  const testText = `StockMan translation diagnostic ${Date.now().toString(36)}`;
  const tracked = createQuotaAwareTranslationClient(provider, undefined, undefined, { deferCacheWriteUntilValidated: true }, {
    provider: AZURE_TRANSLATION_PROVIDER,
    monthlyLimit: AZURE_TRANSLATION_MONTHLY_LIMIT,
    hourlyLimit: AZURE_TRANSLATION_HOURLY_LIMIT,
  });
  try {
    const result = await tracked.client.translate(testText, "en", "ko", "text");
    if (result.fallback) {
      return response({
        ok: false,
        requestId,
        mode: "AZURE_TRANSLATOR_LIVE_TEST",
        checkedAt: new Date().toISOString(),
        configuration,
        result: "not_sent_due_to_application_quota",
        fallbackReason: result.fallbackReason,
        quota: tracked.getMetrics(),
      }, 429);
    }
    return response({
      ok: true,
      requestId,
      mode: "AZURE_TRANSLATOR_LIVE_TEST",
      checkedAt: new Date().toISOString(),
      configuration,
      result: {
        provider: result.provider,
        source: result.source,
        target: result.target,
        translated: result.translatedText !== testText,
        translatedText: result.translatedText,
        providerAttemptCount: result.providerAttemptCount ?? 1,
      },
      quota: tracked.getMetrics(),
    });
  } catch (error) {
    const operation = error instanceof TranslationClientOperationError ? error : null;
    const failure = tracked.getMetrics().lastFailure;
    return response({
      ok: false,
      requestId,
      mode: "AZURE_TRANSLATOR_LIVE_TEST",
      checkedAt: new Date().toISOString(),
      configuration,
      stage: operation?.stage ?? "provider_request",
      provider: operation?.provider ?? AZURE_TRANSLATION_PROVIDER,
      providerFailure: failure ?? {
        provider: AZURE_TRANSLATION_PROVIDER,
        category: "unknown",
        httpStatus: null,
        providerCode: null,
        providerMessage: null,
        requestId: null,
        retryAfter: null,
        attempts: operation?.providerAttempts ?? 0,
      },
      quota: tracked.getMetrics(),
    }, 502);
  }
}
