import { NextResponse } from "next/server";
import { listStockmanEvents } from "@/lib/stockman-events";

export const dynamic = "force-dynamic";
const ALLOWED_HOURS = new Set([1, 12, 24, 168]);
const GRADES = new Set(["A", "B", "C", "EXCLUDED"]);
const VERIFICATION = new Set(["VERIFIED", "UNVERIFIED", "REJECTED"]);
const DILUTION = new Set(["LOW", "MEDIUM", "HIGH", "UNKNOWN"]);

function isoDate(value: string | null) {
  if (value === null) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawHours = params.get("hours");
  const hours = rawHours === null ? null : Number(rawHours);
  if (hours !== null && (!Number.isInteger(hours) || !ALLOWED_HOURS.has(hours))) return NextResponse.json({ ok: false, error: "INVALID_HOURS", allowed: [...ALLOWED_HOURS] }, { status: 400 });
  const from = isoDate(params.get("from"));
  const to = isoDate(params.get("to"));
  if (from === null || to === null || (from && to && from > to) || (hours !== null && (params.has("from") || params.has("to")))) return NextResponse.json({ ok: false, error: "INVALID_DATE_RANGE" }, { status: 400 });
  const ticker = (params.get("ticker") ?? "").trim().toUpperCase();
  if (ticker && !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) return NextResponse.json({ ok: false, error: "INVALID_TICKER" }, { status: 400 });
  const eventType = (params.get("eventType") ?? "").trim().toUpperCase();
  if (eventType && !/^[A-Z][A-Z0-9_ -]{0,39}$/.test(eventType)) return NextResponse.json({ ok: false, error: "INVALID_EVENT_TYPE" }, { status: 400 });
  const grade = (params.get("grade") ?? "").trim().toUpperCase();
  const verificationStatus = (params.get("verificationStatus") ?? "").trim().toUpperCase();
  const dilutionRisk = (params.get("dilutionRisk") ?? "").trim().toUpperCase();
  if (grade && !GRADES.has(grade)) return NextResponse.json({ ok: false, error: "INVALID_GRADE" }, { status: 400 });
  if (verificationStatus && !VERIFICATION.has(verificationStatus)) return NextResponse.json({ ok: false, error: "INVALID_VERIFICATION_STATUS" }, { status: 400 });
  if (dilutionRisk && !DILUTION.has(dilutionRisk)) return NextResponse.json({ ok: false, error: "INVALID_DILUTION_RISK" }, { status: 400 });
  const sort = params.get("sort") ?? "latest";
  if (sort !== "latest" && sort !== "importance") return NextResponse.json({ ok: false, error: "INVALID_SORT" }, { status: 400 });
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? params.get("limit") ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 || (page - 1) * pageSize > 1_000_000) return NextResponse.json({ ok: false, error: "INVALID_PAGE" }, { status: 400 });
  try {
    const result = await listStockmanEvents({ hours, from, to, ticker: ticker || null, eventType: eventType || null, grade: grade || null, verificationStatus: verificationStatus || null, dilutionRisk: dilutionRisk || null, sort, page, pageSize });
    return NextResponse.json({ ok: true, query: { hours, from: from?.toISOString() ?? null, to: to?.toISOString() ?? null, ticker: ticker || null, eventType: eventType || null, grade: grade || null, verificationStatus: verificationStatus || null, dilutionRisk: dilutionRisk || null, sort }, timezone: "UTC (timestamps); Asia/Seoul display available in reports", ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "EVENTS_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
