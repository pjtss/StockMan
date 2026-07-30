import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getUsFreeFloat } from "@/lib/us-free-float";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() || "";
  if (!ticker) return NextResponse.json({ error: "티커를 입력하세요." }, { status: 400 });
  const result = await getUsFreeFloat(ticker);
  return NextResponse.json({ ok: result.ok, request: { method: "GET", endpoint: "/stable/shares-float", ticker }, result });
}
