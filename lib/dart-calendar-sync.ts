import { fetchOpenDartToday, type OpenDartListRow } from "./dart-opendart-client";
import { upsertInvestmentCalendarEvents } from "./investment-calendar";
import { fetchDomesticRss } from "./domestic-rss-sources";

function dateKey(value: string | undefined) {
  const raw = (value ?? "").replace(/[^0-9]/g, "");
  return raw.length >= 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;
}

function classify(title: string) {
  if (/배당|배당락/.test(title)) return "DIVIDEND_PAYMENT" as const;
  if (/영업실적|잠정\s*실적|재무제표|분기보고서|반기보고서|사업보고서/.test(title)) return "EARNINGS" as const;
  if (/주주총회|주총/.test(title)) return "SHAREHOLDER_MEETING" as const;
  if (/보호예수|의무보유/.test(title)) return "LOCKUP_EXPIRY" as const;
  return null;
}

function mapKindItems(items: Array<{ id: string; title: string; link: string; publishedAt: string | null; raw?: unknown }>) {
  return items.flatMap((item) => /신규상장|재상장|상장폐지/.test(item.title) && item.publishedAt ? [{ market: "KR", code: null, companyName: "", eventType: "IPO" as const, eventDate: item.publishedAt.slice(0, 10), eventEndDate: null, title: item.title, description: "KRX KIND 공시 RSS 기준 일정입니다.", source: "KRX_KIND", sourceUrl: item.link || null, externalId: item.id, rawPayload: item.raw ?? {} }] : []);
}

export async function syncDartCalendarEvents() {
  const [feed, kind] = await Promise.all([fetchOpenDartToday(), fetchDomesticRss("KRX_KIND")]);
  const events = feed.rows.flatMap((row: OpenDartListRow) => {
    const receiptNo = row.rcept_no?.trim(); const title = row.report_nm?.trim(); const eventType = title ? classify(title) : null; const eventDate = dateKey(row.rcept_dt) ?? dateKey(receiptNo?.slice(0, 8));
    if (!receiptNo || !title || !eventType || !eventDate) return [];
    return [{ market: "KR", code: row.stock_code?.trim() || null, companyName: row.corp_name?.trim() || "", eventType, eventDate, eventEndDate: null, title, description: "DART 공시 접수일 기준 일정입니다.", source: "OPENDART", sourceUrl: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${encodeURIComponent(receiptNo)}`, externalId: receiptNo }];
  });
  const allEvents = [...events, ...mapKindItems(kind.items)];
  return { source: "OPENDART+KRX_KIND", dateKey: feed.dateKey, scanned: feed.rows.length + kind.items.length, upserted: await upsertInvestmentCalendarEvents(allEvents) };
}
