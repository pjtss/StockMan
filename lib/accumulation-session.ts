import { validTradingDate } from "./accumulation-screener-core";

export type AccumulationRegion = "KR" | "US";
const formatters = {
  KR: new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
  US: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
};
function localClock(region: AccumulationRegion, timestamp: Date): string {
  return formatters[region].format(timestamp).replace(/[- :]/g, "");
}
export function cacheDateCutoff(region: AccumulationRegion, asOf: Date): string {
  const clock = localClock(region, asOf), date = clock.slice(0, 8);
  if (clock.slice(8) >= (region === "KR" ? "1530" : "1600")) return date;
  const previous = new Date(date.slice(0, 4) + "-" + date.slice(4, 6) + "-" + date.slice(6) + "T00:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10).replaceAll("-", "");
}

/** Conservative regular-close check. No inferred early closes or holiday calendar. */
export function createClosedCandleCheck(region: AccumulationRegion, asOf: Date) {
  const clocks = new Map<string, string>();
  return (date: string, updatedAt: string): boolean => {
    if (!validTradingDate(date)) return false;
    const fetched = new Date(updatedAt);
    if (!Number.isFinite(fetched.getTime()) || fetched > asOf) return false;
    let clock = clocks.get(updatedAt);
    if (!clock) { clock = localClock(region, fetched); clocks.set(updatedAt, clock); }
    return clock >= date + (region === "KR" ? "1530" : "1600");
  };
}
