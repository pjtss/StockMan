import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getTickerOverview } from "@/lib/discord-ticker-overview";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() || "";
  if (!code) return NextResponse.json({ error: "종목코드를 입력하세요." }, { status: 400 });
  const overview = await getTickerOverview(code);
  return NextResponse.json({ ok: Boolean(overview), request: { method: "GET", endpoint: "/api/discord/interactions", command: "/ticker", symbol: code }, overview });
}
