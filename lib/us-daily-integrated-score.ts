export type DailySignalGroup = "obv" | "adl" | "macd" | "dmi" | "mfi" | "breakout";

export type IntegratedDailyCandidate = {
  ticker: string;
  name: string | null;
  score: number;
  grade: "A" | "B" | "C";
  signals: DailySignalGroup[];
  reasons: string[];
};

const WEIGHTS: Record<DailySignalGroup, number> = { breakout: 25, obv: 20, adl: 20, macd: 15, dmi: 10, mfi: 10 };

function tickerOf(value: Record<string, unknown>) {
  return String(value.ticker ?? value.code ?? value.symbol ?? "").trim().toUpperCase();
}

function nameOf(value: Record<string, unknown>) {
  const name = value.name ?? value.company;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

/** Combines independent daily signals without changing their original scans. */
export function scoreIntegratedDailyCandidates(groups: Partial<Record<DailySignalGroup, readonly Record<string, unknown>[]>>, limit = 50) {
  const byTicker = new Map<string, { name: string | null; signals: Set<DailySignalGroup> }>();
  for (const [group, items] of Object.entries(groups) as [DailySignalGroup, readonly Record<string, unknown>[] | undefined][]) {
    if (!items) continue;
    for (const item of items) {
      const ticker = tickerOf(item);
      if (!ticker) continue;
      const current = byTicker.get(ticker) ?? { name: nameOf(item), signals: new Set<DailySignalGroup>() };
      current.signals.add(group);
      if (!current.name) current.name = nameOf(item);
      byTicker.set(ticker, current);
    }
  }
  return [...byTicker.entries()].map(([ticker, value]): IntegratedDailyCandidate => {
    const signals = [...value.signals].sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
    const score = signals.reduce((sum, signal) => sum + WEIGHTS[signal], 0);
    return { ticker, name: value.name, score, grade: score >= 70 ? "A" : score >= 45 ? "B" : "C", signals, reasons: signals.map((signal) => `${signal.toUpperCase()} 신호 충족`) };
  }).sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker)).slice(0, limit);
}
