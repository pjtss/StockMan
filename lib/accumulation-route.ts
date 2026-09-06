import { NextResponse } from "next/server";
import { runAccumulationScreener } from "./accumulation-screener";
import type { AccumulationRegion } from "./accumulation-session";

export async function handleAccumulationRequest(request: Request, region: AccumulationRegion) {
  const params = new URL(request.url).searchParams;
  const values: Record<string, number> = {};
  for (const key of ["limit", "minRvol", "minScore"]) {
    if (!params.has(key)) continue;
    const raw = params.get(key)!;
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < 0 || (key === "limit" && (!Number.isInteger(value) || value < 1)) || (key === "minScore" && value > 100)) {
      return NextResponse.json({ ok: false, error: "INVALID_SCAN_PARAMETER", parameter: key }, { status: 400 });
    }
    values[key] = value;
  }
  try {
    const report = await runAccumulationScreener(region, { ...values, limit: Math.min(values.limit ?? 100, 1000) });
    const { loadMs, evaluateMs, totalMs } = report.timings ?? { loadMs: 0, evaluateMs: 0, totalMs: 0 };
    return NextResponse.json(report, { headers: {
      "server-timing": `db-load;dur=${loadMs}, evaluate;dur=${evaluateMs}, total;dur=${totalMs}`,
      "x-scan-load-ms": String(loadMs),
      "x-scan-evaluate-ms": String(evaluateMs),
      "x-scan-total-ms": String(totalMs),
    } });
  } catch {
    return NextResponse.json({ ok: false, error: region + "_ACCUMULATION_UNAVAILABLE" }, { status: 503 });
  }
}
