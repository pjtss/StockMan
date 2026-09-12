export type CandidateState = { market: string; code: string; priority: number; lastSeenAt: number; lastCheckedAt: number; nextCheckAt: number; consecutiveFailures: number };
export type VwapState = { sessionDate: string; cumulativeVolume: number; cumulativeTradingValue: number; vwap: number; lastTradeAt: number };
export type TopRisingItem = { market: string; code: string; rank?: number; rate?: number; volume?: number; tradingValue?: number };

export class IntradayMemoryState {
  private readonly snapshots = new Map<string, Map<string, TopRisingItem>>();
  private readonly candidates = new Map<string, CandidateState>();
  private readonly vwap = new Map<string, VwapState>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  constructor(private readonly maxCandidates = 300) {}
  private key(market: string, code: string) { return `${market}:${code}`; }
  rotateSnapshot(items: TopRisingItem[], now = Date.now()) { const current = new Map(items.map(item => [this.key(item.market, item.code), item])); this.snapshots.set("previous", this.snapshots.get("current") ?? new Map()); this.snapshots.set("current", current); return { collectedAt: now, count: current.size, entered: [...current.keys()].filter(key => !this.snapshots.get("previous")?.has(key)), exited: [...(this.snapshots.get("previous")?.keys() ?? [])].filter(key => !current.has(key)) }; }
  getCandidate(market: string, code: string) { return this.candidates.get(this.key(market, code)); }
  dueCandidates(now = Date.now(), limit = 20) { return [...this.candidates.values()].filter((candidate) => candidate.nextCheckAt <= now).sort((a, b) => b.priority - a.priority || a.nextCheckAt - b.nextCheckAt).slice(0, limit); }
  scheduleCandidate(market: string, code: string, now = Date.now()) { const candidate = this.getCandidate(market, code); if (!candidate) return undefined; const intervalMs = candidate.priority >= 100 ? 10_000 : candidate.priority >= 60 ? 30_000 : 120_000; const updated = { ...candidate, lastCheckedAt: now, nextCheckAt: now + intervalMs }; this.candidates.set(this.key(market, code), updated); return updated; }
  upsertCandidate(value: CandidateState) { this.candidates.set(this.key(value.market, value.code), value); this.evictCandidates(); }
  removeCandidate(market: string, code: string) { this.candidates.delete(this.key(market, code)); this.vwap.delete(this.key(market, code)); }
  updateVwap(market: string, code: string, sessionDate: string, volume: number, tradingValue: number, lastTradeAt = Date.now()) { const key = this.key(market, code); const previous = this.vwap.get(key); const state = previous?.sessionDate === sessionDate ? { ...previous, cumulativeVolume: previous.cumulativeVolume + volume, cumulativeTradingValue: previous.cumulativeTradingValue + tradingValue, lastTradeAt } : { sessionDate, cumulativeVolume: volume, cumulativeTradingValue: tradingValue, vwap: volume > 0 ? tradingValue / volume : 0, lastTradeAt }; state.vwap = state.cumulativeVolume > 0 ? state.cumulativeTradingValue / state.cumulativeVolume : 0; this.vwap.set(key, state); return state; }
  getVwap(market: string, code: string) { return this.vwap.get(this.key(market, code)); }
  snapshot() { return { current: [...(this.snapshots.get("current")?.values() ?? [])], previous: [...(this.snapshots.get("previous")?.values() ?? [])], candidates: [...this.candidates.values()].sort((a, b) => b.priority - a.priority), vwap: [...this.vwap.entries()].map(([key, value]) => ({ key, ...value })), inflightCount: this.inflight.size }; }
  async shared<T>(key: string, task: () => Promise<T>) { const running = this.inflight.get(key); if (running) return running as Promise<T>; const next = task().finally(() => this.inflight.delete(key)); this.inflight.set(key, next); return next; }
  clearSession(sessionDate: string) { for (const [key, value] of this.vwap) if (value.sessionDate !== sessionDate) this.vwap.delete(key); }
  private evictCandidates() { while (this.candidates.size > this.maxCandidates) { const oldest = [...this.candidates.entries()].sort((a, b) => a[1].priority - b[1].priority || a[1].lastSeenAt - b[1].lastSeenAt)[0]?.[0]; if (!oldest) break; this.candidates.delete(oldest); this.vwap.delete(oldest); } }
}

export const intradayMemoryState = new IntradayMemoryState();
