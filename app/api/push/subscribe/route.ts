import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { loadPushSubscriptionDebug, savePushSubscription, updatePushSubscriptionPreferences } from "@/lib/push";

export const dynamic = "force-dynamic";

function parseSubscriptionBody(body: unknown, requireKeys: boolean) {
  if (!body || typeof body !== "object") throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const value = body as Record<string, unknown>;
  const endpoint = typeof value.endpoint === "string" ? value.endpoint.trim() : "";
  if (!endpoint || endpoint.length > 2048) throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const keys = value.keys && typeof value.keys === "object" ? value.keys as Record<string, unknown> : {};
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (requireKeys && (!p256dh || !auth || p256dh.length > 512 || auth.length > 512)) throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const bool = (input: unknown, fallback = true) => typeof input === "boolean" ? input : fallback;
  return { endpoint, p256dh, auth, enabled: bool(value.enabled), dartEnabled: bool(value.dartEnabled), intensityEnabled: bool(value.intensityEnabled), risingEnabled: bool(value.risingEnabled) };
}

export async function POST(request: Request) {
  try {
    const body = parseSubscriptionBody(await request.json(), true);
    await ensureSchema();
    await savePushSubscription({
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
      enabled: body.enabled,
      dartEnabled: body.dartEnabled,
      intensityEnabled: body.intensityEnabled,
      risingEnabled: body.risingEnabled,
    });

    const debug = await loadPushSubscriptionDebug(body.endpoint);

    return NextResponse.json({
      ok: true,
      savedCount: debug.count,
      currentDeviceSaved: debug.currentDeviceSaved,
      latestUpdatedAt: debug.latest?.updatedAt ?? null,
      latestEndpoint: debug.latest?.endpoint ?? null,
      enabled: debug.currentDevice?.enabled ?? true,
      dartEnabled: debug.currentDevice?.dartEnabled ?? true,
      intensityEnabled: debug.currentDevice?.intensityEnabled ?? true,
      risingEnabled: debug.currentDevice?.risingEnabled ?? true,
    });
  } catch (error) {
    const invalid = error instanceof SyntaxError || error instanceof Error && error.message === "INVALID_PUSH_SUBSCRIPTION";
    if (!invalid) console.error("[API /push/subscribe POST] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ error: invalid ? "INVALID_PUSH_SUBSCRIPTION" : "PUSH_SUBSCRIPTION_FAILED" }, { status: invalid ? 400 : 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = parseSubscriptionBody(await request.json(), false);
    await ensureSchema();
    await updatePushSubscriptionPreferences({
      endpoint: body.endpoint,
      p256dh: "",
      auth: "",
      enabled: body.enabled,
      dartEnabled: body.dartEnabled,
      intensityEnabled: body.intensityEnabled,
      risingEnabled: body.risingEnabled,
    });

    const debug = await loadPushSubscriptionDebug(body.endpoint);

    return NextResponse.json({
      ok: true,
      currentDeviceSaved: debug.currentDeviceSaved,
      latestUpdatedAt: debug.latest?.updatedAt ?? null,
      enabled: debug.currentDevice?.enabled ?? true,
      dartEnabled: debug.currentDevice?.dartEnabled ?? true,
      intensityEnabled: debug.currentDevice?.intensityEnabled ?? true,
      risingEnabled: debug.currentDevice?.risingEnabled ?? true,
    });
  } catch (error) {
    const invalid = error instanceof SyntaxError || error instanceof Error && error.message === "INVALID_PUSH_SUBSCRIPTION";
    if (!invalid) console.error("[API /push/subscribe PATCH] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ error: invalid ? "INVALID_PUSH_SUBSCRIPTION" : "PUSH_PREFERENCES_FAILED" }, { status: invalid ? 400 : 503 });
  }
}

export async function GET(request: Request) {
  try {
    await ensureSchema();
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint") ?? undefined;
    const debug = await loadPushSubscriptionDebug(endpoint);
    return NextResponse.json({
      ok: true,
      savedCount: debug.count,
      currentDeviceSaved: debug.currentDeviceSaved,
      latestEndpoint: debug.latest?.endpoint ?? null,
      latestUpdatedAt: debug.latest?.updatedAt ?? null,
      latestUserAgent: debug.latest?.userAgent ?? null,
      enabled: debug.currentDevice?.enabled ?? true,
      dartEnabled: debug.currentDevice?.dartEnabled ?? true,
      intensityEnabled: debug.currentDevice?.intensityEnabled ?? true,
      risingEnabled: debug.currentDevice?.risingEnabled ?? true,
    });
  } catch (error) {
    console.error("[API /push/subscribe] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "푸시 구독 상태 조회에 실패했습니다." }, { status: 503 });
  }
}
