export type CandidateLifecycle = "OBSERVED" | "PRIORITIZED" | "CONFIRMED" | "QUALIFIED" | "STALE" | "DEGRADED" | "WARMING_UP";
export type CandidateState = { market: string; code: string; priority: number; lastSeenAt: number; lastCheckedAt: number; nextCheckAt: number; consecutiveFailures: number; marketCap?: number | null; tradingValue?: number | null; mvpTracking?: boolean; focusTracking?: boolean; focusRank?: number; state?: CandidateLifecycle; consecutiveObservations?: number; lastObservedAt?: number; dataAgeSeconds?: number; rollingTurnoverValue?: number; rollingTurnoverRatio?: number; turnoverWindowStart?: number; turnoverWindowEnd?: number; mvpQualified?: boolean };
export type VwapState = { sessionDate: string; cumulativeVolume: number; cumulativeTradingValue: number; vwap: number; lastTradeAt: number };
export type TopRisingItem = { market: string; code: string; name?: string; rank?: number; rate?: number; volume?: number; tradingValue?: number };
export const INTRADAY_MVP_POLICY = Object.freeze({ windowMs: 5 * 60_000, threshold: 0.05, requiredSamples: 5, bucketMs: 60_000 });

export class IntradayMemoryState {
  private readonly snapshots = new Map<string, Map<string, TopRisingItem>>();
  private readonly candidates = new Map<string, CandidateState>();
  private readonly vwap = new Map<string, VwapState>();
  private readonly rollingTurnover = new Map<string, Map<number, number>>();
  private readonly rollingTurnoverTotals = new Map<string, number>();
  private readonly rollingTurnoverSession = new Map<string, string>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly maxCandidates = 300) {}
  private key(market: string, code: string) { return `${market}:${code}`; }
  rotateSnapshot(items: TopRisingItem[], now = Date.now()) { const current = new Map(items.map(item => [this.key(item.market, item.code), item])); this.snapshots.set("previous", this.snapshots.get("current") ?? new Map()); this.snapshots.set("current", current); for (const [key, candidate] of this.candidates) if (candidate.mvpTracking && !current.has(key)) { this.candidates.delete(key); this.vwap.delete(key); this.rollingTurnover.delete(key); this.rollingTurnoverTotals.delete(key); this.rollingTurnoverSession.delete(key); } return { collectedAt: now, count: current.size, entered: [...current.keys()].filter(key => !this.snapshots.get("previous")?.has(key)), exited: [...(this.snapshots.get("previous")?.keys() ?? [])].filter(key => !current.has(key)) }; }
  getCandidate(market: string, code: string) { return this.candidates.get(this.key(market, code)); }
  dueCandidates(now = Date.now(), limit = 20) { return [...this.candidates.values()].filter((candidate) => candidate.nextCheckAt <= now).sort((a, b) => b.priority - a.priority || a.nextCheckAt - b.nextCheckAt).slice(0, limit); }
  scheduleCandidate(market: string, code: string, now = Date.now()) { const candidate = this.getCandidate(market, code); if (!candidate) return undefined; const intervalMs = candidate.focusTracking ? 15_000 : candidate.mvpTracking ? 60_000 : candidate.priority >= 100 ? 10_000 : candidate.priority >= 60 ? 30_000 : 120_000; const updated = { ...candidate, lastCheckedAt: now, nextCheckAt: now + intervalMs }; this.candidates.set(this.key(market, code), updated); return updated; }
  upsertCandidate(value: CandidateState) { this.candidates.set(this.key(value.market, value.code), value); this.evictCandidates(); }
  recordQuality(market: string, code: string, state: CandidateLifecycle, observedAt = Date.now(), dataAgeSeconds?: number) { const candidate = this.getCandidate(market, code); if (!candidate) return undefined; const previousState = candidate.state; const consecutiveObservations = state === "STALE" || state === "DEGRADED" || state === "WARMING_UP" ? 0 : (candidate.consecutiveObservations ?? 0) + 1; const updated = { ...candidate, state, consecutiveObservations, lastObservedAt: observedAt, dataAgeSeconds }; this.candidates.set(this.key(market, code), updated); return { ...updated, previousState }; }
  removeCandidate(market: string, code: string) { const key = this.key(market, code); this.candidates.delete(key); this.vwap.delete(key); this.rollingTurnover.delete(key); this.rollingTurnoverTotals.delete(key); this.rollingTurnoverSession.delete(key); }
  recordRollingTurnover(market: string, code: string, sessionDate: string, bucketAt: number, tradingValue: number, marketCap: number, windowMs: number = INTRADAY_MVP_POLICY.windowMs, threshold: number = INTRADAY_MVP_POLICY.threshold) {
    const key = this.key(market, code);
    bucketAt = Number.isFinite(bucketAt) ? Math.floor(bucketAt / 60_000) * 60_000 : Date.now();
    if (this.rollingTurnoverSession.get(key) !== sessionDate) { this.rollingTurnover.delete(key); this.rollingTurnoverTotals.delete(key); this.rollingTurnoverSession.set(key, sessionDate); }
    const buckets = this.rollingTurnover.get(key) ?? new Map<number, number>();
    this.rollingTurnover.set(key, buckets);
    if (Number.isFinite(bucketAt) && tradingValue >= 0) { const previous = buckets.get(bucketAt); buckets.set(bucketAt, tradingValue); this.rollingTurnoverTotals.set(key, (this.rollingTurnoverTotals.get(key) ?? 0) - (previous ?? 0) + tradingValue); }
    const cutoff = bucketAt - windowMs + 60_000;
    for (const [timestamp, value] of buckets) if (timestamp < cutoff) { buckets.delete(timestamp); this.rollingTurnoverTotals.set(key, (this.rollingTurnoverTotals.get(key) ?? 0) - value); }
    const entries = [...buckets.entries()].sort(([a], [b]) => a - b);
    const total = this.rollingTurnoverTotals.get(key) ?? 0;
    const ratio = marketCap > 0 ? total / marketCap : null;
    const candidate = this.getCandidate(market, code);
    if (!candidate) return { sessionDate, windowStart: entries[0]?.[0] ?? bucketAt, windowEnd: bucketAt, sampleCount: entries.length, tradingValue: total, ratio, qualified: ratio != null && entries.length >= 5 && ratio >= threshold };
    const qualified = ratio != null && entries.length >= 5 && ratio >= threshold;
    this.candidates.set(key, { ...candidate, rollingTurnoverValue: total, rollingTurnoverRatio: ratio ?? undefined, turnoverWindowStart: entries[0]?.[0] ?? bucketAt, turnoverWindowEnd: bucketAt, mvpQualified: qualified });
    return { sessionDate, windowStart: entries[0]?.[0] ?? bucketAt, windowEnd: bucketAt, sampleCount: entries.length, tradingValue: total, ratio, qualified };
  }
  updateVwap(market: string, code: string, sessionDate: string, volume: number, tradingValue: number, lastTradeAt = Date.now()) { const key = this.key(market, code); const previous = this.vwap.get(key); const state = previous?.sessionDate === sessionDate ? { ...previous, cumulativeVolume: previous.cumulativeVolume + volume, cumulativeTradingValue: previous.cumulativeTradingValue + tradingValue, lastTradeAt } : { sessionDate, cumulativeVolume: volume, cumulativeTradingValue: tradingValue, vwap: volume > 0 ? tradingValue / volume : 0, lastTradeAt }; state.vwap = state.cumulativeVolume > 0 ? state.cumulativeTradingValue / state.cumulativeVolume : 0; this.vwap.set(key, state); return state; }
  getVwap(market: string, code: string) { return this.vwap.get(this.key(market, code)); }
  snapshot() { return { current: [...(this.snapshots.get("current")?.values() ?? [])], previous: [...(this.snapshots.get("previous")?.values() ?? [])], candidates: [...this.candidates.values()].sort((a, b) => b.priority - a.priority), rollingTurnover: [...this.rollingTurnover.entries()].map(([key, buckets]) => ({ key, buckets: [...buckets.entries()].sort(([a], [b]) => a - b).map(([observedAt, tradingValue]) => ({ observedAt, tradingValue })) })), vwap: [...this.vwap.entries()].map(([key, value]) => ({ key, ...value })), inflightCount: this.inflight.size }; }
  async shared<T>(key: string, task: () => Promise<T>) { const running = this.inflight.get(key); if (running) return running as Promise<T>; const next = task().finally(() => this.inflight.delete(key)); this.inflight.set(key, next); return next; }
  clearSession(sessionDate: string) { for (const [key, value] of this.vwap) if (value.sessionDate !== sessionDate) this.vwap.delete(key); for (const key of this.rollingTurnover.keys()) { this.rollingTurnover.delete(key); this.rollingTurnoverTotals.delete(key); this.rollingTurnoverSession.delete(key); } }
  private evictCandidates() { while (this.candidates.size > this.maxCandidates) { const oldest = [...this.candidates.entries()].sort((a, b) => a[1].priority - b[1].priority || a[1].lastSeenAt - b[1].lastSeenAt)[0]?.[0]; if (!oldest) break; this.candidates.delete(oldest); this.vwap.delete(oldest); this.rollingTurnover.delete(oldest); this.rollingTurnoverTotals.delete(oldest); this.rollingTurnoverSession.delete(oldest); } }
}

export const intradayMemoryState = new IntradayMemoryState();
