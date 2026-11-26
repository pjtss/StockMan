import { getPublicDailyExportFromRequest } from "@/lib/public-daily-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");
  return getPublicDailyExportFromRequest("US", format);
}
