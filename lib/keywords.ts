"use client";

export const KEYWORDS_STORAGE_KEY = "rss_custom_keywords";

export function getKeywords(): string[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(KEYWORDS_STORAGE_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Keywords parse error:", e);
    return [];
  }
}

export function saveKeywords(keywords: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYWORDS_STORAGE_KEY, JSON.stringify(keywords));
}

export function toggleKeyword(keyword: string): string[] {
  if (!keyword || keyword.trim() === "") return getKeywords();
  
  const current = getKeywords();
  const kw = keyword.trim();
  const updated = current.includes(kw)
    ? current.filter((k) => k !== kw)
    : [...current, kw];
    
  saveKeywords(updated);
  return updated;
}
