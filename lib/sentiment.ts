const HISTORY_KEY = "market_sentiment_history";
const MAX_HISTORY = 20;

export type SentimentSnapshot = {
  score: number;
  timestamp: string;
};

export function getSentimentHistory(): SentimentSnapshot[] {
  if (typeof window === "undefined") return [];
  const saved = localStorage.getItem(HISTORY_KEY);
  if (!saved) return [];
  try {
    return JSON.parse(saved);
  } catch {
    return [];
  }
}

export function addSentimentSnapshot(score: number) {
  if (typeof window === "undefined") return;
  const history = getSentimentHistory();
  const now = new Date().toISOString();
  
  // Only add if last snapshot was more than 1 minute ago to avoid spam
  if (history.length > 0) {
    const last = new Date(history[history.length - 1].timestamp);
    if (Date.now() - last.getTime() < 60000) return;
  }

  const newHistory = [...history, { score, timestamp: now }].slice(-MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
}
