import { XMLParser } from "fast-xml-parser";
import type { DartItem, DartJudgment, FeedPayload } from "@/lib/types";
import { calculateDartScore } from "./scoring";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
});

const DART_URL = "https://dart.fss.or.kr/api/todayRSS.xml";

const SEOUL_TIME_ZONE = "Asia/Seoul";

function ensureArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function stripCdata(value: string | undefined): string {
  return (value ?? "")
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .trim();
}

function normalizeText(value: unknown): string {
  const clean = (input: string) => stripCdata(input)
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (typeof value === "string") {
    return clean(value);
  }
  if (value && typeof value === "object" && "#text" in value) {
    return clean(String(value["#text"]));
  }
  return "";
}

function toSeoulDateKey(value: string): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getTodayInSeoul(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function sortByPublishedAtDesc<T extends { publishedAt: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => {
    const leftTime = new Date(left.publishedAt).getTime();
    const rightTime = new Date(right.publishedAt).getTime();
    return rightTime - leftTime;
  });
}

function extractDartCompany(title: string): string {
  const cleaned = title.trim().replace(/^\s*(\([^)]+\)|\[[^\]]+\])\s*/, "");
  const hyphenMatch = cleaned.match(/^\s*([^-]{1,40}?)\s*-\s*/);
  if (hyphenMatch) {
    return hyphenMatch[1].trim();
  }

  const fallbackMatch = cleaned.match(/^\s*([^\(\)\[\]:]{2,40})/);
  if (fallbackMatch) {
    return fallbackMatch[1].trim();
  }

  return "종목명미확인";
}

function classifyDartTitle(title: string): DartJudgment {
  return calculateDartScore(title).judgment;
}

function extractDartKeywords(title: string): string[] {
  return calculateDartScore(title).keywords;
}

type DartRawItem = {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
};

function extractRceptNo(link: string): string {
  const match = link.match(/rcpNo=(\d{14})/);
  return match ? match[1] : "";
}

export function parseDartItems(xml: string, todayInSeoul: string): DartItem[] {
  const parsed = parser.parse(xml);
  return ensureArray<DartRawItem>(parsed?.rss?.channel?.item)
    .map((item) => {
      const title = normalizeText(item.title);
      const publishedAt = normalizeText(item.pubDate);
      const judgment = classifyDartTitle(title);
      if (toSeoulDateKey(publishedAt) !== todayInSeoul || !["최강호재", "호재가능"].includes(judgment)) {
        return null;
      }

      const link = normalizeText(item.link);
      return {
        source: "DART" as const,
        company: extractDartCompany(title),
        title,
        judgment,
        keywords: extractDartKeywords(title),
        publishedAt,
        link,
        rceptNo: extractRceptNo(link),
      };
    })
    .filter((item): item is DartItem => item !== null);
}

export async function fetchDartFeed(): Promise<FeedPayload<DartItem>> {
  const todayInSeoul = getTodayInSeoul();
  const response = await fetch(DART_URL, {
    cache: "no-store",
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`DART RSS 요청 실패: ${response.status}`);
  }

  const xml = await response.text();
  const items = sortByPublishedAtDesc(parseDartItems(xml, todayInSeoul));

  return {
    source: "DART",
    fetchedAt: new Date().toISOString(),
    items,
  };
}
