import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { forwardBreakingNews } from "@/lib/kis-breaking-news-forwarder";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  try { return NextResponse.json({ ok: true, ...(await forwardBreakingNews({ send: params.get("send") === "true", date: params.get("date") || undefined, time: params.get("time") || undefined })) }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 502 }); }
}
