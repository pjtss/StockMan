import type { FeatureModuleKey } from "@/lib/feature-modules";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";

const COMPLETION_MODULES = new Set<FeatureModuleKey>([
  "kr-daily-cache",
  "us-daily-cache",
  "us-daily-open-cache",
  "us-free-float",
  "us-product-classification",
]);

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compact(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function resultSummary(summary: Record<string, unknown>) {
  const preferred = ["instrumentCount", "successCount", "failureCount", "savedCandleCount", "processedCount", "sent", "skipped"];
  const selected = Object.fromEntries(preferred.filter((key) => key in summary).map((key) => [key, summary[key]]));
  if (Object.keys(selected).length) return compact(selected);
  return compact(summary.counts ?? summary.result ?? { ok: true });
}

async function postCompletionWebhook(url: string, body: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function notifyAutomationCompletion(moduleKey: FeatureModuleKey, status: "SUCCESS" | "FAILED", summary: Record<string, unknown>, errorMessage?: string) {
  if (!COMPLETION_MODULES.has(moduleKey)) return { sent: false, skipped: true, reason: "module_not_supported" };
  let configured = false;
  let webhook = "";
  try {
    const settings = await loadFeatureModuleSettings(moduleKey);
    const completion = settings.featureSettings?.automationCompletion as { enabled?: boolean; webhookUrl?: string } | undefined;
    if (completion?.enabled === false) return { sent: false, skipped: true, reason: "disabled" };
    webhook = completion?.webhookUrl?.trim() || process.env.AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL?.trim() || "";
    configured = Boolean(webhook);
  } catch (error) {
    console.warn(`[Automation] completion settings unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error);
    webhook = process.env.AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL?.trim() || "";
    configured = Boolean(webhook);
  }
  if (!webhook) return { sent: false, skipped: true, reason: "webhook_not_configured", configured };

  const durationMs = asNumber((summary.observability as Record<string, unknown> | undefined)?.durationMs);
  const label = moduleKey === "kr-daily-cache"
    ? "국내 일봉 캐시"
    : moduleKey === "us-daily-cache"
      ? "해외 일봉 캐시"
      : moduleKey === "us-daily-open-cache"
        ? "해외 일봉 시가 캐시"
        : moduleKey === "us-free-float"
          ? "해외 유통주 갱신"
          : "해외 상품분류 갱신";
  const lines = [
    `${status === "SUCCESS" ? "✅" : "❌"} ${label} 자동화 완료`,
    `상태: ${status === "SUCCESS" ? "성공" : "실패"}`,
    durationMs == null ? null : `소요 시간: ${(durationMs / 1000).toFixed(2)}초`,
    `결과: ${resultSummary(summary)}`,
    errorMessage ? `오류: ${errorMessage}` : null,
    `완료 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
  ].filter(Boolean).join("\n");
  const response = await postCompletionWebhook(webhook, JSON.stringify({ username: "STOCKMAN 자동화", content: lines.slice(0, 1900), allowed_mentions: { parse: [] } }));
  if (!response.ok) throw new Error(`Discord HTTP ${response.status}`);
  return { sent: true, skipped: false, configured: true };
}
