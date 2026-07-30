import { NextResponse } from "next/server";
import { fetchFreeShortInterest } from "@/lib/short-interest-service";
import { scoreShortInterest } from "@/lib/short-interest-score";

export async function GET(_request: Request, context: { params: Promise<{ ticker: string }> }) {
  const ticker = (await context.params).ticker;
  const metric = await fetchFreeShortInterest(ticker);
  return NextResponse.json({ ok: metric.status === "OK" || metric.status === "ZERO_SHORT_VOLUME", metric, score: scoreShortInterest(metric) });
}
