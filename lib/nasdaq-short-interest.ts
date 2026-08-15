export type NasdaqShortInterest = { ok: boolean; ticker: string; shortInterest: number | null; averageDailyVolume: number | null; daysToCover: number | null; asOf: string | null; raw: unknown; error?: string };
const numberValue = (value: unknown) => { if (value == null || String(value).trim() === "") return null; const n = Number(String(value).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
/** Public Nasdaq quote endpoint. Best-effort free fallback; raw response is retained for diagnostics. */
export async function fetchNasdaqShortInterest(rawTicker: string): Promise<NasdaqShortInterest> {
  const ticker = rawTicker.trim().toUpperCase();
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(ticker)}/short-interest?assetclass=stocks`;
  try {
    const response = await fetch(url, { headers: { accept: "application/json, text/plain, */*", "user-agent": "Mozilla/5.0 Stockman/1.0" }, cache: "no-store" });
    const raw = await response.json().catch(() => null);
    const rows = (raw as any)?.data?.rows ?? (raw as any)?.data?.table?.rows ?? [];
    const row = Array.isArray(rows) ? rows[0] : null;
    const shortInterest = numberValue(row?.shortInterest ?? row?.shortInterestShares ?? row?.interest);
    const averageDailyVolume = numberValue(row?.averageDailyVolume ?? row?.avgDailyVolume);
    const daysToCover = numberValue(row?.daysToCover) ?? (shortInterest != null && averageDailyVolume ? shortInterest / averageDailyVolume : null);
    return { ok: response.ok && shortInterest != null, ticker, shortInterest, averageDailyVolume, daysToCover, asOf: row?.settlementDate ?? row?.settlementDateFormatted ?? null, raw, ...(response.ok ? {} : { error: `NASDAQ HTTP ${response.status}` }) };
  } catch (error) { return { ok: false, ticker, shortInterest: null, averageDailyVolume: null, daysToCover: null, asOf: null, raw: null, error: error instanceof Error ? error.message : String(error) }; }
}
