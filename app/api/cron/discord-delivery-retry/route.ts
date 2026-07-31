import { NextResponse } from "next/server";
import { retryDiscordDeliveries } from "@/lib/discord-delivery-retry";

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const supplied = request.headers.get("x-cron-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || supplied !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await retryDiscordDeliveries()) });
}
export const GET = handle;
export const POST = handle;
