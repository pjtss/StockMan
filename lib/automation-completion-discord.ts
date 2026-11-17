import { getFeatureModule, type FeatureModuleKey } from "@/lib/feature-modules";
import { loadFeatureModuleSettings } from "@/lib/feature-module-settings";
import { loadFeatureDiscordDebugWebhook } from "@/lib/discord-config";
import { getMarketRssTranslationReasonDisplay } from "@/lib/market-rss-translation-reason";

const COMPLETION_MODULES = new Set<FeatureModuleKey>([
  "kr-daily-cache",
  "us-daily-cache",
  "us-daily-open-cache",
  "kr-bollinger-band",
  "kr-bollinger-middle-lower",
  "us-bollinger-band",
  "us-bollinger-middle-lower",
  "market-rss",
]);
const MAX_COMPLETION_CONTENT_LENGTH = 1_900;

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  if (maxLength <= 0) return "";
  if (maxLength === 1) return "…";
  let end = maxLength - 1;
  const lastCodeUnit = value.charCodeAt(end - 1);
  if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff) end -= 1;
  return `${value.slice(0, end)}…`;
}

function assembleCompletionContent(prefix: string[], optional: string[], suffix: string[]) {
  const boundedPrefix = prefix.map((line, index) => truncateText(line, [180, 150, 60, 650][index] ?? 180));
  const boundedSuffix = suffix.map((line, index) => truncateText(line, index === 0 ? 500 : 80));
  const baseLength = [...boundedPrefix, ...boundedSuffix].join("\n").length;
  let optionalBudget = Math.max(0, MAX_COMPLETION_CONTENT_LENGTH - baseLength);
  const selectedOptional: string[] = [];
  for (const line of optional) {
    const cost = line.length + 1;
    if (cost <= optionalBudget) {
      selectedOptional.push(line);
      optionalBudget -= cost;
      continue;
    }
    if (optionalBudget >= 2) selectedOptional.push(truncateText(line, optionalBudget - 1));
    break;
  }
  return [...boundedPrefix, ...selectedOptional, ...boundedSuffix].join("\n");
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function compact(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function resultSummary(summary: Record<string, unknown>) {
  const preferred = ["instrumentCount", "successCount", "failureCount", "partialFailureCount", "translationFailureCount", "counterDataInvalid", "degraded", "deliveryFailedCount", "retryQueuedCount", "savedCandleCount", "processedCount", "sent", "skipped", "reason", "intervalSeconds", "elapsedSeconds", "latestRunStatus"];
  const selected = Object.fromEntries(preferred.filter((key) => key in summary).map((key) => [key, summary[key]]));
  const discord = summary.discord && typeof summary.discord === "object" ? summary.discord as Record<string, unknown> : null;
  if (discord) selected.discordDelivery = discord.ok === false ? "FAILED" : discord.ok === true ? "SENT_OR_SKIPPED" : "UNKNOWN";
  if (Object.keys(selected).length) return compact(selected);
  return compact(summary.counts ?? summary.result ?? { ok: true });
}

function statusMessage(moduleKey: FeatureModuleKey, status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED", summary: Record<string, unknown>) {
  if (status === "SUCCESS") return "성공";
  if (status === "SKIPPED") return "건너뜀";
  if (status === "PARTIAL") {
    const discord = summary.discord && typeof summary.discord === "object" ? summary.discord as Record<string, unknown> : null;
    if (discord?.ok === false) return "부분 완료(Discord 알림 전송 실패)";
    if (summary.degraded === true) return "부분 완료(일부 처리·전달·검증 단계 저하)";
    if (moduleKey === "market-rss" && (asNumber(summary.partialFailureCount) ?? 0) > 0) return "부분 완료(RSS 수집/번역 일부 실패)";
    if (moduleKey === "market-rss") return "부분 완료(RSS 처리·전달·검증 단계 저하)";
    return "부분 완료(일부 종목 데이터 미수신)";
  }
  if (summary.degraded === true) return "실패(처리·전달·검증 단계 오류)";
  return "실패";
}

function followupSummary(summary: Record<string, unknown>) {
  const lines: string[] = [];
  if (summary.counterDataInvalid === true) lines.push("counterDataInvalid: RSS 수집·번역 집계 카운터 오류 · 실제 실패 건수 확인 필요");
  const translated = summary.translated as Record<string, unknown> | undefined;
  if (translated && typeof translated === "object") {
    const reasons = translated.fallbackReasons && typeof translated.fallbackReasons === "object"
      ? translated.fallbackReasons as Record<string, unknown>
      : {};
    const activeReasons = Object.entries(reasons)
      .filter(([, count]) => typeof count === "number" && count > 0);
    const reasonSummary = activeReasons
      .slice(0, 4)
      .map(([reason, count]) => `${getMarketRssTranslationReasonDisplay(reason).shortLabel} ${count}건`);
    if (reasonSummary.length) {
      const omittedReasonCount = activeReasons.length - reasonSummary.length;
      lines.push(`RSS 번역 fallback: ${reasonSummary.join(" · ")}${omittedReasonCount > 0 ? ` · 외 ${omittedReasonCount}종 생략` : ""}`);
    }
  }
  const bollinger = summary.bollingerCache as Record<string, unknown> | undefined;
  if (bollinger) {
    if (bollinger.skipped === true) lines.push(`볼린저밴드: 건너뜀(${compact(bollinger.reason)})`);
    else {
      const lower = bollinger.LOWER_OR_BELOW as Record<string, unknown> | undefined;
      const middle = bollinger.MIDDLE_TO_LOWER as Record<string, unknown> | undefined;
      lines.push(`볼린저밴드: 하단 이하 ${compact(lower?.qualifiedCount ?? "-")}개 · 중단~하단 ${compact(middle?.qualifiedCount ?? "-")}개`);
    }
  }
  const golden = summary.goldenCrossCache as Record<string, unknown> | undefined;
  if (golden) {
    if (golden.skipped === true) lines.push(`골든크로스: 건너뜀(${compact(golden.reason)})`);
    else {
      const cache = golden.cache as Record<string, unknown> | undefined;
      lines.push(`골든크로스: 조건 충족 ${compact(cache?.qualifiedCount ?? golden.qualifiedCount ?? "-")}개 · ${golden.ok === false ? "실패" : "갱신 완료"}`);
    }
  }
  return lines;
}

async function postCompletionWebhook(url: string, body: string) {
  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}wait=true`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      });
      if (response.ok || (response.status >= 400 && response.status < 500 && response.status !== 429) || attempt === maxAttempts) {
        return { response, attempts: attempt };
      }
      lastError = new Error(`Discord HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) throw error;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function notifyAutomationCompletion(moduleKey: FeatureModuleKey, status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED", summary: Record<string, unknown>, errorMessage?: string) {
  if (!COMPLETION_MODULES.has(moduleKey)) return { sent: false, skipped: true, reason: "module_not_supported" };
  // RSS runs frequently; report actionable translation/ingest degradation,
  // but suppress routine green completion messages to avoid Discord spam.
  if (moduleKey === "market-rss" && status === "SUCCESS") return { sent: false, skipped: true, reason: "success_notifications_suppressed" };
  let configured = false;
  let webhook = "";
  try {
    const settings = await loadFeatureModuleSettings(moduleKey);
    const completion = settings.featureSettings?.automationCompletion as { enabled?: boolean; webhookUrl?: string } | undefined;
    if (completion?.enabled === false) return { sent: false, skipped: true, reason: "disabled" };
    // Cache execution results are operational diagnostics: prefer the
    // module's existing debug channel, while retaining the completion webhook
    // as a fallback for installations that have not configured one.
    webhook = await loadFeatureDiscordDebugWebhook(moduleKey) || completion?.webhookUrl?.trim() || process.env.AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL?.trim() || "";
    configured = Boolean(webhook);
  } catch (error) {
    console.warn(`[Automation] completion settings unavailable for ${moduleKey}:`, error instanceof Error ? error.message : error);
    webhook = process.env.AUTOMATION_COMPLETION_DISCORD_WEBHOOK_URL?.trim() || "";
    configured = Boolean(webhook);
  }
  if (!webhook) return { sent: false, skipped: true, reason: "webhook_not_configured", configured };
  const deliveryDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  // Completion notifications are sent only after an actual worker execution.
  // Schedule/interval observations are persisted as SKIPPED runs but are not
  // delivered to Discord to avoid cron-driven notification spam.

  const durationMs = asNumber((summary.observability as Record<string, unknown> | undefined)?.durationMs);
  const label = getFeatureModule(moduleKey)?.label ?? moduleKey;
  const failureCount = asNumber(summary.failureCount);
  const failureMessage = status === "FAILED"
    ? errorMessage ?? (failureCount != null && failureCount > 0 ? `${failureCount}개 종목 처리 실패` : "자동화 작업 전체 실패")
    : null;
  const prefixLines = [
    `${status === "SUCCESS" ? "✅" : status === "PARTIAL" ? "⚠️" : status === "SKIPPED" ? "⏭️" : "❌"} ${label} 자동화 완료`,
    `상태: ${statusMessage(moduleKey, status, summary)}`,
    durationMs == null ? null : `소요 시간: ${(durationMs / 1000).toFixed(2)}초`,
    `결과: ${resultSummary(summary)}`,
  ].filter((line): line is string => Boolean(line));
  const completedAtLine = `완료 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`;
  const suffixLines = [
    failureMessage ? `오류: ${failureMessage}` : null,
    completedAtLine,
  ].filter((line): line is string => Boolean(line));
  const content = assembleCompletionContent(prefixLines, followupSummary(summary), suffixLines);
  try {
    const delivered = await postCompletionWebhook(webhook, JSON.stringify({ username: "STOCKMAN 자동화", content, allowed_mentions: { parse: [] } }));
    if (!delivered.response.ok) throw new Error(`Discord HTTP ${delivered.response.status}`);
    return { sent: true, skipped: false, configured: true, attempts: delivered.attempts, deliveryDate };
  } catch (error) {
    throw error;
  }
}
