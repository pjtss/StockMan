import { handlePublicDailyCacheRefresh } from "@/lib/public-daily-cache-refresh";
import { notifyDailyCacheRefreshIssue } from "@/lib/automation-completion-discord";

export const maxDuration = 5_400;

export async function POST() {
  try {
    return await handlePublicDailyCacheRefresh("KR");
  } catch (error) {
    console.error("[API /public/daily-cache/kr/refresh] refresh failed:", error instanceof Error ? error.message.slice(0, 1_000) : "unknown error");
    await notifyDailyCacheRefreshIssue("KR", "request-setup", "KR_DAILY_CACHE_REFRESH_UNAVAILABLE").catch(() => undefined);
    return Response.json({ ok: false, market: "KR", error: "KR_DAILY_CACHE_REFRESH_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
