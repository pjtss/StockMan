import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchFinraComposite } from "@/lib/finra-short-composite";
import { scoreShortInterest } from "@/lib/short-interest-score";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ticker = new URL(request.url).searchParams.get("ticker")?.trim().toUpperCase() || "";
  if (!ticker) return NextResponse.json({ error: "티커를 입력하세요." }, { status: 400 });
  const composite = await fetchFinraComposite(ticker);
  const metric = composite.metric;
  return NextResponse.json({ ok: metric.status === "OK" || metric.status === "ZERO_SHORT_VOLUME", request: { endpoints: ["FINRA_SHORT_VOLUME_URL", "FINRA_SHORT_INTEREST_URL", "FINRA_THRESHOLD_URL"], ticker }, ...composite, score: scoreShortInterest(metric) });
}
