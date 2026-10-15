import { NextResponse } from "next/server";
import { buildKisRealtimeFrame, getKisRealtimeUrl, issueKisRealtimeApprovalKey, type KisRealtimeSubscription } from "@/lib/kis-realtime";
import { consumeKisRealtimeApprovalLimit } from "@/lib/kis-realtime-approval-rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market = url.searchParams.get("market")?.toUpperCase();
  const channel = url.searchParams.get("channel") === "asking" ? "asking" : "trade";
  const code = url.searchParams.get("code")?.replace(/^US:/i, "").trim().toUpperCase() ?? "";
  const exchange = url.searchParams.get("exchange")?.toUpperCase();
  const paper = url.searchParams.get("paper") === "true";
  if ((market !== "KR" && market !== "US") || !code || (market === "KR" && !/^\d{6}$/.test(code)) || (market === "US" && !/^[A-Z0-9._-]+$/.test(code))) {
    return NextResponse.json({ ok: false, error: "INVALID_REALTIME_SUBSCRIPTION" }, { status: 400 });
  }
  // nginx overwrites X-Real-IP with $remote_addr; use the final forwarded hop as fallback.
  const clientIp = request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim()
    || "unknown";
  const limit = consumeKisRealtimeApprovalLimit(clientIp);
  if (!limit.allowed) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED" },
      { status: 429, headers: { "cache-control": "no-store", "retry-after": String(limit.retryAfterSeconds) } },
    );
  }
  const subscription: KisRealtimeSubscription = { market, channel, code, ...(market === "US" && (exchange === "NAS" || exchange === "NYS" || exchange === "AMS") ? { exchange } : {}) };
  let approvalKey: string | null;
  try {
    approvalKey = await issueKisRealtimeApprovalKey({ paper });
  } catch {
    return NextResponse.json({ ok: false, error: "KIS_APPROVAL_KEY_UNAVAILABLE" }, { status: 503 });
  }
  if (!approvalKey) return NextResponse.json({ ok: false, error: "KIS_APPROVAL_KEY_UNAVAILABLE" }, { status: 503 });
  return NextResponse.json({ ok: true, market, channel, code, wsUrl: getKisRealtimeUrl(paper), frame: buildKisRealtimeFrame({ approvalKey, subscription }) }, { headers: { "cache-control": "no-store" } });
}
