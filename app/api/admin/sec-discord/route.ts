import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { sendSecResultToDiscord, type SecDiscordResult } from "@/lib/discord-sec";

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const result = body?.result as SecDiscordResult | undefined;
  if (!result) {
    return NextResponse.json({ error: "result payload is required" }, { status: 400 });
  }

  try {
    const discord = await sendSecResultToDiscord(result);
    if (!discord.ok) {
      return NextResponse.json(
        {
          error: "Discord webhook send failed",
          discord,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      discord,
    });
  } catch (error) {
    console.error("[API /admin/sec-discord] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "SEC_DISCORD_SEND_FAILED" }, { status: 502 });
  }
}
