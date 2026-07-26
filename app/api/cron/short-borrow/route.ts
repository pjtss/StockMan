import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { fetchUsTurnoverRatioScanner } from "@/lib/us-turnover-ratio";
import { fetchShortBorrow } from "@/lib/short-borrow-service";
import { withAutomationLock } from "@/lib/automation-lock";

export const dynamic = "force-dynamic";

async function handle(request: Request) {
  const secret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret") || "";
  if (!secret || secret !== process.env.CRON_SECRET) return NextResponse.json({ code: "UNAUTHORIZED" }, { status: 401 });
  const data = await withAutomationLock("short-borrow", async () => {
    await ensureSchema();
    const scanner = await fetchUsTurnoverRatioScanner({ excd: "AMS" }, ["AMS", "NAS", "NYS"]);
    if (!scanner) return { ok: false, code: "CANDIDATE_SOURCE_UNAVAILABLE" } as const;
    const results = [];
    for (const item of scanner.filtered.slice(0, 100)) {
      try {
        results.push(await fetchShortBorrow(item.code, { currentPrice: Number(String(item.price).replace(/,/g, "")) }));
      } catch (error) {
        console.error("[ShortBorrow] candidate failed:", item.code, error instanceof Error ? error.message : error);
      }
    }
    return { ok: true, candidateCount: scanner.filtered.length, results };
  });
  return NextResponse.json(data ?? { ok: true, skipped: true, reason: "already_running" });
}
export const GET = handle;
export const POST = handle;
