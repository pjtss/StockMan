import { XMLParser } from "fast-xml-parser";
import type { DartItem, DartJudgment, FeedPayload, SecItem, SecSentiment } from "@/lib/types";
import { calculateDartScore } from "./scoring";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
  processEntities: false,
  htmlEntities: false,
});

const DART_URL = "https://dart.fss.or.kr/api/todayRSS.xml";
const SEC_PAGE_SIZE = 100;
const SEC_BASE_URL =
  "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&company=&count=100&dateb=&output=atom&owner=include";
const SEC_USER_AGENT = "MySecWatcher/1.0 your_email@example.com";

// SEC 관련 키워드는 우선 유지 (필요 시 별도 스코어링 모듈화 가능)
const SEC_POSITIVE_KEYWORDS = [
  "ENTRY INTO A MATERIAL DEFINITIVE AGREEMENT",
  "RESULTS OF OPERATIONS",
  "EARNINGS",
  "DIVIDEND",
  "REPURCHASE",
  "COMPLETION OF ACQUISITION",
  "MATERIAL AGREEMENT",
];

const SEC_NEGATIVE_KEYWORDS = [
  "BANKRUPTCY",
  "GOING CONCERN",
  "DEFAULT",
  "DELIST",
  "OFFERING",
  "DILUTION",
  "TERMINATION",
];

const SEC_STRONG_POSITIVE_FORMS = ["8-K", "10-K", "10-Q", "6-K", "SC 13D", "SC 13G"];

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
  if (typeof value === "string") {
    return stripCdata(value);
  }
  if (value && typeof value === "object" && "#text" in value) {
    return stripCdata(String(value["#text"]));
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

function normalizeSecFormType(formType: string): string {
  const value = formType.toUpperCase().trim();
  if (value === "424B3") {
    return "424B3";
  }
  if (value === "13D" || value === "SC 13D") {
    return "SC 13D";
  }
  if (value === "13G" || value === "SC 13G") {
    return "SC 13G";
  }
  return value;
}

type SecTag = {
  term?: string;
};

type SecRawEntry = {
  id?: unknown;
  title?: unknown;
  summary?: unknown;
  link?: { href?: string } | Array<{ href?: string }>;
  published?: unknown;
  updated?: unknown;
  category?: SecTag | SecTag[];
};

function extractSecFormType(entry: SecRawEntry, title: string, summary: string): string {
  const text = `${title} ${summary}`;
  const patterns = [/\b8-K\b/i, /\b10-K\b/i, /\b10-Q\b/i, /\b6-K\b/i, /\bS-1\b/i, /\b424B3\b/i, /\bSC 13D\b/i, /\bSC 13G\b/i, /\b13D\b/i, /\b13G\b/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return normalizeSecFormType(match[0]);
    }
  }

  const categories = ensureArray(entry.category);
  for (const category of categories) {
    if (category?.term) {
      return normalizeSecFormType(category.term);
    }
  }

  return "UNKNOWN";
}

function extractSecAccession(entry: SecRawEntry): string {
  const source = normalizeText(entry.id) || extractSecLink(entry);
  const match = source.match(/(\d{10}-\d{2}-\d{6})/);
  return match ? match[1] : source.trim();
}

function extractSecCompany(title: string): string {
  const match = title.match(/-\s+(.+?)\s+\(\d{10}\)/);
  if (match) {
    return match[1].trim();
  }
  return title ? title.slice(0, 120) : "UNKNOWN";
}

function classifySecEntry(formType: string, title: string, summary: string): SecSentiment {
  const text = `${formType} ${title} ${summary}`.toUpperCase();

  if (SEC_STRONG_POSITIVE_FORMS.includes(formType) && SEC_POSITIVE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "호재가능";
  }
  if (SEC_NEGATIVE_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return "악재가능";
  }
  if (["8-K", "10-K", "10-Q", "6-K"].includes(formType)) {
    return "중요공시";
  }
  return "일반공시";
}

function extractSecLink(entry: SecRawEntry): string {
  const links = ensureArray(entry.link);
  const alternate = links.find((link) => link?.href);
  return alternate?.href ?? "";
}

export function parseSecItems(xml: string, todayInSeoul: string): { items: SecItem[]; foundToday: boolean } {
  const parsed = parser.parse(xml);
  const entries = ensureArray<SecRawEntry>(parsed?.feed?.entry);
  
  if (entries.length === 0) {
    return { items: [], foundToday: false };
  }

  let foundToday = false;
  const items = entries.reduce<SecItem[]>((acc, entry) => {
    const title = normalizeText(entry.title);
    const summary = normalizeText(entry.summary);
    const formType = extractSecFormType(entry, title, summary);
    const sentiment = classifySecEntry(formType, title, summary);
    const publishedAt = normalizeText(entry.published) || normalizeText(entry.updated);

    if (toSeoulDateKey(publishedAt) !== todayInSeoul || sentiment !== "호재가능") {
      return acc;
    }

    foundToday = true;

    acc.push({
      source: "SEC" as const,
      accession: extractSecAccession(entry),
      company: extractSecCompany(title),
      formType,
      sentiment,
      publishedAt,
      title,
      summary,
      link: extractSecLink(entry),
    });

    return acc;
  }, []);

  return { items, foundToday };
}

export async function fetchSecFeed(): Promise<FeedPayload<SecItem>> {
  const todayInSeoul = getTodayInSeoul();
  const allItems: SecItem[] = [];

  for (let start = 0; start <= 1000; start += SEC_PAGE_SIZE) {
    const response = await fetch(`${SEC_BASE_URL}&start=${start}`, {
      cache: "no-store",
      headers: {
        Accept: "application/atom+xml, application/xml, text/xml",
        "User-Agent": SEC_USER_AGENT,
      },
    });

    if (!response.ok) {
      throw new Error(`SEC RSS 요청 실패: ${response.status}`);
    }

    const xml = await response.text();
    const { items, foundToday } = parseSecItems(xml, todayInSeoul);
    allItems.push(...items);

    if (!foundToday || items.length === 0) {
      break;
    }
  }

  const items = sortByPublishedAtDesc(allItems);

  return {
    source: "SEC",
    fetchedAt: new Date().toISOString(),
    items,
  };
}
