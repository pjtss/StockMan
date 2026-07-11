import { NextResponse } from "next/server";
import { runFilingSync } from "@/lib/filing-sync";

export const dynamic = "force-dynamic";

async function handleSyncFilings(request: Request) {
  const secret = new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(await runFilingSync());
}

export const GET = handleSyncFilings;
export const POST = handleSyncFilings;
