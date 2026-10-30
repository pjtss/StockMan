import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { resolveUsObvDivergenceWebhook, sendUsObvDivergenceToDiscord } from "@/lib/discord-us-obv-divergence";
import { scanUsObvDivergenceOnDemand } from "@/lib/us-obv-divergence-scan";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(request: Request) {
  if (!isCronRequestAuthorized(request)) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const webhook = await resolveUsObvDivergenceWebhook();
    const payload = await scanUsObvDivergenceOnDemand();
    const delivery = await sendUsObvDivergenceToDiscord(payload, webhook);
    if (!delivery.ok) {
      return NextResponse.json({ ok: false, error: "DISCORD_DELIVERY_FAILED", asOfEtDate: payload.asOfEtDate, scan: payload, delivery }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      asOfEtDate: payload.asOfEtDate,
      scanStatus: payload.scanStatus,
      universe: payload.universe,
      tickers: payload.items.map((item) => item.ticker).join(", "),
      scan: payload,
      discord: delivery,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "US_OBV_DIVERGENCE_DISCORD_FAILED";
    if (["US_MARKET_WEEKEND", "BEFORE_DAILY_DATA_SETTLEMENT_WINDOW"].includes(code)) {
      return NextResponse.json({ ok: false, error: code }, { status: 409 });
    }
    console.error("[API /cron/us-obv-divergence-discord] Request failed", code);
    const status = code === "US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL is not configured"
      || code === "INVALID_US_OBV_DIVERGENCE_DISCORD_WEBHOOK_URL" ? 503 : 502;
    return NextResponse.json({ ok: false, error: status === 503 ? code : "US_OBV_DIVERGENCE_DISCORD_FAILED" }, { status });
  }
}
