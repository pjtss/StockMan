"use client";

export const WATCHLIST_KEY = "rss_watchlist";

export function getWatchlist(): string[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(WATCHLIST_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Watchlist parse error:", e);
    return [];
  }
}

export function saveWatchlist(watchlist: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(watchlist));
}

export function toggleWatchlist(company: string): string[] {
  const current = getWatchlist();
  const updated = current.includes(company)
    ? current.filter((c) => c !== company)
    : [...current, company];
  saveWatchlist(updated);
  return updated;
}
