import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchUsTurnoverRatioScanner } from "@/lib/us-turnover-ratio";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const result = await fetchUsTurnoverRatioScanner({
    excd: url.searchParams.get("excd") || undefined,
    gubn: url.searchParams.get("gubn") || undefined,
    nday: url.searchParams.get("nday") || undefined,
    volRang: url.searchParams.get("volRang") || undefined,
  });
  if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  return NextResponse.json(result);
}
