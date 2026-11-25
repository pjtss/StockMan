import { getPublicDailyExport } from "@/lib/public-daily-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return getPublicDailyExport("KR");
}
