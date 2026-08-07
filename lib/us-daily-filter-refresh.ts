import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";

export async function runUsDailyFilterRefresh() {
  const startedAt = new Date().toISOString();
  const [obv, mfi, dmi, macd, breakout] = await Promise.all([
    scanStoredUsDailyObv(), scanStoredUsMfiOversold(), scanStoredUsDmi(), scanStoredUsMacd(), runUsDailyBreakoutScan(),
  ]);
  const indicatorSend = await sendUsDailyIndicatorSignals({ obv: obv.qualified as any, mfi: mfi.qualified as any, dmi: dmi.qualified as any, macd: macd.qualified as any });
  const breakoutSend = await sendUsDailyBreakoutToDiscord(breakout.qualified);
  return { ok: true, startedAt, completedAt: new Date().toISOString(), counts: { obv: obv.qualified.length, mfi: mfi.qualified.length, dmi: dmi.qualified.length, macd: macd.qualified.length, breakout: breakout.qualified.length }, instruments: { obv: obv.instrumentCount, mfi: mfi.instrumentCount, dmi: dmi.instrumentCount, macd: macd.instrumentCount, breakout: breakout.instrumentCount }, webhook: { indicators: indicatorSend, breakout: breakoutSend } };
}
