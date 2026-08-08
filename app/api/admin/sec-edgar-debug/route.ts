import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { describeError, isSchemaError } from "@/lib/error-diagnostics";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadLatestAutomationRun } from "@/lib/automation-run-repository";
import { resolveSecEdgarRuntimeConfig } from "@/lib/sec-edgar-config";
import { responseTimeMs, resolveRequestId, withRequestTrace } from "@/lib/request-trace";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, init: ResponseInit | undefined, requestId: string, startedAt: number) {
  const response = NextResponse.json(body, init);
  response.headers.set("content-type", "application/json; charset=utf-8");
  return withRequestTrace(response, requestId, startedAt);
}

function configuredSource(value: unknown, environmentValue: string | undefined) {
  if (value !== undefined && value !== null && value !== "") return "feature-settings";
  return environmentValue?.trim() ? "environment" : "missing";
}

/**
 * Return SEC Submissions diagnostics without exposing secret values.
 * CIKs are public identifiers, so the resolved list is intentionally included
 * to make an empty/misconfigured production environment immediately visible.
 */
export async function GET(request: Request) {
  const startedAt = Date.now();
  const requestId = resolveRequestId(request);
  if (!(await requireAdminSession())) return json({ ok: false, requestId, responseTimeMs: responseTimeMs(startedAt), error: "Unauthorized" }, { status: 401 }, requestId, startedAt);

  try {
    const settings = await loadFeatureModuleSettings("sec-realtime");
    const configured = settings.featureSettings?.secEdgar;
    const runtime = resolveSecEdgarRuntimeConfig(settings.featureSettings);
    const latest = await loadLatestAutomationRun("sec-realtime");
    const webhookFromSettings = settings.featureSettings?.discordFormat?.webhookUrl;
    const webhookConfiguredInSettings = typeof webhookFromSettings === "string" && webhookFromSettings.trim().length > 0;
    const webhookConfiguredInEnvironment = Boolean(process.env.SEC_DISCORD_WEBHOOK_URL?.trim());

    return json({
      ok: true,
      requestId,
      responseTimeMs: responseTimeMs(startedAt),
      checkedAt: new Date().toISOString(),
      feature: {
        enabled: settings.enabled,
        startTime: settings.startTime,
        endTime: settings.endTime,
        activeDays: settings.activeDays,
        scheduleMode: settings.scheduleMode,
      },
      runtime: {
        ciks: runtime.ciks,
        cikCount: runtime.ciks.length,
        syncXbrl: runtime.syncXbrl,
        discordBatch: runtime.discordBatch,
        sources: {
          ciks: configured?.ciks?.length ? "feature-settings" : configuredSource(configured?.ciks, process.env.SEC_SYNC_CIKS),
          syncXbrl: typeof configured?.syncXbrl === "boolean" ? "feature-settings" : configuredSource(configured?.syncXbrl, process.env.SEC_SYNC_XBRL),
          discordBatch: configured?.discordBatch !== undefined ? "feature-settings" : configuredSource(configured?.discordBatch, process.env.SEC_EDGAR_DISCORD_BATCH),
          discordWebhook: webhookConfiguredInSettings ? "feature-settings" : webhookConfiguredInEnvironment ? "environment" : "missing",
        },
      },
      environment: {
        secUserAgentConfigured: Boolean(process.env.SEC_USER_AGENT?.trim()),
        secSyncCiksConfigured: Boolean(process.env.SEC_SYNC_CIKS?.trim()),
        secSyncXbrlConfigured: process.env.SEC_SYNC_XBRL !== undefined,
        secDiscordBatchConfigured: Boolean(process.env.SEC_EDGAR_DISCORD_BATCH?.trim()),
        secDiscordWebhookConfigured: webhookConfiguredInSettings || webhookConfiguredInEnvironment,
      },
      latestRun: latest ? {
        id: latest.id,
        status: latest.status,
        startedAt: latest.startedAt,
        finishedAt: latest.finishedAt,
        durationMs: latest.finishedAt && latest.startedAt ? latest.finishedAt.getTime() - latest.startedAt.getTime() : null,
        errorMessage: latest.errorMessage,
        summary: latest.summary,
      } : null,
    }, undefined, requestId, startedAt);
  } catch (error) {
    const diagnostics = describeError(error);
    return json({ ok: false, requestId, responseTimeMs: responseTimeMs(startedAt), stage: "load_sec_debug", ...diagnostics, checkedAt: new Date().toISOString() }, { status: isSchemaError(error) ? 503 : 500 }, requestId, startedAt);
  }
}
