import type { DartItem } from "./types";

export function formatTime(value: string, short = false): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (short) {
    return new Intl.DateTimeFormat("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function minutesAgo(value: string): number {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

export function getJudgmentStatus(value: string): "good" | "warn" | "neutral" {
  if (value.includes("최강호재") || value.includes("호재")) {
    return "good";
  }
  if (value.includes("중요")) {
    return "warn";
  }
  return "neutral";
}

export function sortByPublishedAtDesc<T extends { publishedAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.publishedAt).getTime();
    const rightTime = new Date(right.publishedAt).getTime();
    return rightTime - leftTime;
  });
}

export function paginateItems<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

export function marketLabel(value: string): string {
  if (value === "Y") return "KOSPI";
  if (value === "K") return "KOSDAQ";
  return value || "-";
}

export function isStrongBullish(item: DartItem): boolean {
  return item.judgment.includes("최강호재");
}
