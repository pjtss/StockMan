import { scanStoredUsDailyObv } from "@/lib/us-daily-obv";
import { scanStoredUsMfiOversold } from "@/lib/us-mfi-oversold";
import { scanStoredUsDmi } from "@/lib/us-dmi-scan";
import { scanStoredUsMacd } from "@/lib/us-macd-scan";
import { runUsDailyBreakoutScan } from "@/lib/us-daily-breakout-automation";
import { sendUsDailyIndicatorSignals } from "@/lib/discord-us-daily-signal";
import { sendUsDailyBreakoutToDiscord } from "@/lib/discord-us-daily-breakout";
import { filterUsDailyCandidates } from "@/lib/us-daily-common-filter";
import { createUsDailyScanContext } from "@/lib/us-daily-scan-context";
import { scanStoredUsDailyAdl } from "@/lib/us-adl";
import { scoreIntegratedDailyCandidates } from "@/lib/us-daily-integrated-score";

export async function runUsDailyFilterRefresh() {
  const startedAt = new Date().toISOString();
  const context = await createUsDailyScanContext({ candleLimit: 100 });
  const [obv, mfi, dmi, macd, adl, breakout] = await Promise.all([
    scanStoredUsDailyObv({ context }), scanStoredUsMfiOversold({ context }), scanStoredUsDmi({ context }), scanStoredUsMacd({ context }), scanStoredUsDailyAdl({ context }), runUsDailyBreakoutScan({ context }),
  ]);
  const [obvF, mfiF, dmiF, macdF, adlF, breakoutF] = await Promise.all([obv.qualified, mfi.qualified, dmi.qualified, macd.qualified, adl.qualified, breakout.qualified].map((items) => filterUsDailyCandidates(items as any)));
  const indicatorSend = await sendUsDailyIndicatorSignals({ obv: obvF.filtered as any, mfi: mfiF.filtered as any, dmi: dmiF.filtered as any, macd: macdF.filtered as any, adl: adlF.filtered as any });
  const breakoutSend = await sendUsDailyBreakoutToDiscord(breakoutF.filtered as any);
  const integrated = scoreIntegratedDailyCandidates({ obv: obvF.filtered as any, mfi: mfiF.filtered as any, dmi: dmiF.filtered as any, macd: macdF.filtered as any, adl: adlF.filtered as any, breakout: breakoutF.filtered as any });
  return { ok: true, startedAt, completedAt: new Date().toISOString(), timings: context.timings, counts: { obv: obvF.filtered.length, mfi: mfiF.filtered.length, dmi: dmiF.filtered.length, macd: macdF.filtered.length, adl: adlF.filtered.length, breakout: breakoutF.filtered.length, integrated: integrated.length }, integrated, excluded: { obv: obvF.excludedCount, mfi: mfiF.excludedCount, dmi: dmiF.excludedCount, macd: macdF.excludedCount, adl: adlF.excludedCount, breakout: breakoutF.excludedCount }, failureReasons: { obv: obvF.failureReasons, mfi: mfiF.failureReasons, dmi: dmiF.failureReasons, macd: macdF.failureReasons, adl: adlF.failureReasons, breakout: breakoutF.failureReasons }, instruments: { obv: obv.instrumentCount, mfi: mfi.instrumentCount, dmi: dmi.instrumentCount, macd: macd.instrumentCount, adl: adl.instrumentCount, breakout: breakout.instrumentCount }, webhook: { indicators: indicatorSend, breakout: breakoutSend } };
}
