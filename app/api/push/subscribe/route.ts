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
  if (!p256dh || !auth || p256dh.length > 512 || auth.length > 512) throw new Error("INVALID_PUSH_SUBSCRIPTION");
  const bool = (input: unknown) => typeof input === "boolean" ? input : requireKeys ? false : undefined;
  return { endpoint, p256dh, auth, enabled: bool(value.enabled), dartEnabled: bool(value.dartEnabled), intensityEnabled: bool(value.intensityEnabled), risingEnabled: bool(value.risingEnabled) };
}

function statusResponse(debug: Awaited<ReturnType<typeof loadPushSubscriptionDebug>>) {
  return NextResponse.json({
    ok: true,
    currentDeviceSaved: debug.currentDeviceSaved,
    enabled: debug.currentDevice?.enabled ?? false,
    dartEnabled: debug.currentDevice?.dartEnabled ?? false,
    intensityEnabled: debug.currentDevice?.intensityEnabled ?? false,
    risingEnabled: debug.currentDevice?.risingEnabled ?? false,
    previewMode: debug.currentDevice?.previewMode ?? "GENERIC",
    preferenceRevision: debug.currentDevice?.preferenceRevision ?? 0,
  }, { status: debug.currentDeviceSaved ? 200 : 401 });
}

export async function GET() {
  return NextResponse.json({ error: "PUSH_SUBSCRIPTION_PROOF_REQUIRED" }, { status: 401 });
}

export async function POST(request: Request) {
  try {
    const body = parseSubscriptionBody(await request.json(), true);
    await ensureSchema();
    const saved = await savePushSubscription({
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
      enabled: body.enabled,
      dartEnabled: body.dartEnabled,
      intensityEnabled: body.intensityEnabled,
      risingEnabled: body.risingEnabled,
    });
    if (!saved) return NextResponse.json({ error: "PUSH_SUBSCRIPTION_PROOF_REQUIRED" }, { status: 401 });
    const debug = await loadPushSubscriptionDebug(body.endpoint, body.p256dh, body.auth);
    return statusResponse(debug);
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
    if (body.enabled === undefined && body.dartEnabled === undefined && body.intensityEnabled === undefined && body.risingEnabled === undefined) {
      return statusResponse(await loadPushSubscriptionDebug(body.endpoint, body.p256dh, body.auth));
    }
    await updatePushSubscriptionPreferences({
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      enabled: body.enabled,
      dartEnabled: body.dartEnabled,
      intensityEnabled: body.intensityEnabled,
      risingEnabled: body.risingEnabled,
    });
    const debug = await loadPushSubscriptionDebug(body.endpoint, body.p256dh, body.auth);
    return statusResponse(debug);
  } catch (error) {
    const invalid = error instanceof SyntaxError || error instanceof Error && error.message === "INVALID_PUSH_SUBSCRIPTION";
    if (!invalid) console.error("[API /push/subscribe PATCH] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ error: invalid ? "INVALID_PUSH_SUBSCRIPTION" : "PUSH_PREFERENCES_FAILED" }, { status: invalid ? 400 : 503 });
  }
}
