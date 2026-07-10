import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchKisUsTopRisingApi } from "@/lib/kis-us-api";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const result = await fetchKisUsTopRisingApi({
    excd: url.searchParams.get("excd") || "NAS",
    gubn: url.searchParams.get("gubn") || undefined,
    nday: url.searchParams.get("nday") || undefined,
    volRang: url.searchParams.get("volRang") || undefined,
  });

  if (!result) {
    return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  }

  return NextResponse.json({
    ...result,
  });
}
