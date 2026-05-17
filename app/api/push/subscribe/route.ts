import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { loadPushSubscriptionDebug, savePushSubscription, updatePushSubscriptionPreferences } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await ensureSchema();
    await savePushSubscription({
      endpoint: body.endpoint,
      p256dh: body.keys?.p256dh,
      auth: body.keys?.auth,
      userAgent: request.headers.get("user-agent") ?? undefined,
      enabled: body.enabled ?? true,
      dartEnabled: body.dartEnabled ?? true,
      secEnabled: body.secEnabled ?? true,
      onlyValidated: body.onlyValidated ?? false,
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
      secEnabled: debug.currentDevice?.secEnabled ?? true,
      onlyValidated: debug.currentDevice?.onlyValidated ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "푸시 구독 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    await ensureSchema();
    await updatePushSubscriptionPreferences({
      endpoint: body.endpoint,
      p256dh: "",
      auth: "",
      enabled: body.enabled ?? true,
      dartEnabled: body.dartEnabled ?? true,
      secEnabled: body.secEnabled ?? true,
      onlyValidated: body.onlyValidated ?? false,
    });

    const debug = await loadPushSubscriptionDebug(body.endpoint);

    return NextResponse.json({
      ok: true,
      currentDeviceSaved: debug.currentDeviceSaved,
      latestUpdatedAt: debug.latest?.updatedAt ?? null,
      enabled: debug.currentDevice?.enabled ?? true,
      dartEnabled: debug.currentDevice?.dartEnabled ?? true,
      secEnabled: debug.currentDevice?.secEnabled ?? true,
      onlyValidated: debug.currentDevice?.onlyValidated ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "푸시 설정 저장에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
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
      secEnabled: debug.currentDevice?.secEnabled ?? true,
      onlyValidated: debug.currentDevice?.onlyValidated ?? false,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "푸시 구독 상태 조회에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
