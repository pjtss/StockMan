import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchFreeShortInterest } from "@/lib/short-interest-service";
import { scoreShortInterest } from "@/lib/short-interest-score";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() || "";
  if (!ticker) return NextResponse.json({ error: "티커를 입력하세요." }, { status: 400 });
  const metric = await fetchFreeShortInterest(ticker);
  return NextResponse.json({ ok: metric.status === "OK", request: { endpoint: "FINRA_SHORT_VOLUME_URL", ticker }, metric, score: scoreShortInterest(metric) });
}
