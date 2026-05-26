import { NextResponse } from "next/server";
import { getKisUsDebugLogs } from "@/lib/kis-us-debug";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const since = url.searchParams.get("since");
  const sinceId = since ? Number(since) : undefined;
  const logs = getKisUsDebugLogs(Number.isFinite(sinceId as any) ? sinceId : undefined);

  return NextResponse.json({ logs });
}

