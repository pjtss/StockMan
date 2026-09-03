import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getKisUsDebugLogs } from "@/lib/kis-us-debug";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const parsedSince = since ? Number(since) : undefined;
  const sinceId = parsedSince !== undefined && Number.isSafeInteger(parsedSince) && parsedSince >= 0 ? parsedSince : undefined;
  const logs = getKisUsDebugLogs(sinceId);

  return NextResponse.json({ ok: true, logs });
}
