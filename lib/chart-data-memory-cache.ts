import type { ChartData, OHLCVCandle } from "@/lib/kis-chart";
import { normalizeOHLCVCandles } from "@/lib/chart-candles";
import { isValidCompactCalendarDate } from "@/lib/calendar-date-quality.mjs";

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 128;

type Entry = { value: ChartData; expiresAt: number };
const entries = new Map<string, Entry>();

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "" || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeUsableChartData(value: unknown): ChartData | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<ChartData>;
  if (typeof candidate.code !== "string" || typeof candidate.company !== "string"
    || !Array.isArray(candidate.candles) || candidate.candles.length === 0
    || !Number.isFinite(candidate.latestPrice) || (candidate.latestPrice ?? 0) <= 0
    || typeof candidate.latestChange !== "string" || typeof candidate.latestChangeRate !== "string") return null;
  const indicators = candidate.indicators;
  const indicatorKeys = ["rsi14", "macd", "macdSignal", "macdHist", "bbUpper", "bbMiddle", "bbLower"] as const;
  if (typeof indicators !== "object" || indicators === null
    || !indicatorKeys.every((key) => key in indicators && (indicators[key] === null || Number.isFinite(indicators[key])))) return null;
  const candles = candidate.candles.flatMap((input): OHLCVCandle[] => {
    if (typeof input !== "object" || input === null || typeof input.date !== "string") return [];
    const date = input.date;
    if (/^\d{8}$/.test(date)) {
      if (!isValidCompactCalendarDate(date)) return [];
    } else if (/^\d{14}$/.test(date) && isValidCompactCalendarDate(date.slice(0, 8))) {
      const time = date.slice(8);
      if (Number(time.slice(0, 2)) > 23 || Number(time.slice(2, 4)) > 59 || Number(time.slice(4, 6)) > 59) return [];
    } else {
      return [];
    }
    const open = readFiniteNumber(input.open);
    const high = readFiniteNumber(input.high);
    const low = readFiniteNumber(input.low);
    const close = readFiniteNumber(input.close);
    const volume = readFiniteNumber(input.volume);
    if (open === null || high === null || low === null || close === null || volume === null
      || open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0
      || high < Math.max(open, low, close) || low > Math.min(open, high, close)) return [];
    return [{ ...input, date, open, high, low, close, volume }];
  });
  const normalizedCandles = normalizeOHLCVCandles(candles);
  if (!normalizedCandles.length) return null;
  return { ...candidate, candles: normalizedCandles, indicators } as ChartData;
}

function removeExpiredEntries(now: number) {
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key);
  }
}

export function chartDataMemoryKey(code: string, timeframe: string, exchange?: string) {
  const normalizedInput = code.trim();
  const market = /^US:/i.test(normalizedInput) ? "US" : "KR";
  const normalizedCode = normalizedInput.replace(/^US:/i, "").toUpperCase();
  return [market, normalizedCode, exchange?.trim().toUpperCase() || "*", timeframe.trim().toUpperCase()].join(":");
}

export function getChartDataMemory(key: string, now = Date.now()): ChartData | null {
  if (!Number.isFinite(now)) {
    entries.delete(key);
    return null;
  }
  removeExpiredEntries(now);
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  entries.set(key, entry);
  return entry.value;
}

export function setChartDataMemory(key: string, value: ChartData, now = Date.now(), ttlMs = DEFAULT_TTL_MS) {
  const normalized = normalizeUsableChartData(value);
  if (!key.trim() || !normalized || !Number.isFinite(now) || !Number.isFinite(ttlMs) || ttlMs <= 0) return;
  const expiresAt = now + ttlMs;
  if (!Number.isFinite(expiresAt)) return;
  removeExpiredEntries(now);
  entries.delete(key);
  entries.set(key, { value: normalized, expiresAt });
  while (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
}

export function clearChartDataMemory() {
  entries.clear();
}
