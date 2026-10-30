import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import type { ObvCandidate } from "@/lib/us-obv-divergence";

export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_AGE_MS = 120 * 60 * 60 * 1_000;
const SIGNAL_TYPES = new Set(["ALL", "BOTH", "PIVOT", "TREND"]);
const QUALITIES = new Set(["ALL", "HIGH", "STANDARD", "REVIEW"]);
const SORTS = new Set(["priority", "liquidity", "obv", "priceDrop"]);

type SnapshotPayload = {
  schemaVersion: string;
  algoVersion: string;
  generatedAtUtc: string;
  asOfEtDate: string;
  marketCapLimitUsd: 100_000_000;
  scanStatus: "COMPLETE" | "PARTIAL";
  universe: Record<string, unknown>;
  parameters: Record<string, unknown>;
  warnings: string[];
  items: ObvCandidate[];
};

function parseInteger(value: string | null, fallback: number): number | null {
  if (value == null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parseMinimumDollarVolume(value: string | null): number | null {
  if (value == null) return 0;
  if (!/^(?:\d+)(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isSnapshotPayload(value: unknown): value is SnapshotPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return payload.schemaVersion === "us-obv-divergence.v4"
    && payload.algoVersion === "4.0.0"
    && typeof payload.generatedAtUtc === "string"
    && typeof payload.asOfEtDate === "string"
    && (payload.scanStatus === "COMPLETE" || payload.scanStatus === "PARTIAL")
    && Boolean(payload.universe && typeof payload.universe === "object")
    && Boolean(payload.parameters && typeof payload.parameters === "object")
    && Array.isArray(payload.warnings)
    && Array.isArray(payload.items)
    && payload.items.every((item) => Boolean(item && typeof item === "object" && typeof (item as Record<string, unknown>).ticker === "string"));
}

function sortCandidates(items: ObvCandidate[], sort: string): ObvCandidate[] {
  const copy = [...items];
  if (sort === "liquidity") return copy.sort((a, b) => b.avgDollarVolume20d - a.avgDollarVolume20d || a.ticker.localeCompare(b.ticker));
  if (sort === "obv") return copy.sort((a, b) => b.obv20dAvgVolumeMultiple - a.obv20dAvgVolumeMultiple || a.ticker.localeCompare(b.ticker));
  if (sort === "priceDrop") return copy.sort((a, b) => a.price20dPct - b.price20dPct || a.ticker.localeCompare(b.ticker));
  return copy.sort((a, b) => Number(b.signalType === "BOTH") - Number(a.signalType === "BOTH")
    || Number(b.signalQuality === "HIGH") - Number(a.signalQuality === "HIGH")
    || Number(a.dataIssues.length > 0) - Number(b.dataIssues.length > 0)
    || (b.pivotObvNormalized ?? 0) - (a.pivotObvNormalized ?? 0)
    || b.avgDollarVolume20d - a.avgDollarVolume20d
    || a.ticker.localeCompare(b.ticker));
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const page = parseInteger(params.get("page"), 1);
  const pageSize = parseInteger(params.get("pageSize"), 50);
  const signalType = (params.get("signalType") ?? "ALL").trim().toUpperCase();
  const quality = (params.get("quality") ?? "ALL").trim().toUpperCase();
  const sort = (params.get("sort") ?? "priority").trim();
  const minDollarVolume20d = parseMinimumDollarVolume(params.get("minDollarVolume20d"));
  if (page == null || page < 1 || page > 100_000 || pageSize == null || pageSize < 1 || pageSize > 100
    || !SIGNAL_TYPES.has(signalType) || !QUALITIES.has(quality) || !SORTS.has(sort) || minDollarVolume20d == null) {
    return NextResponse.json({ ok: false, error: "INVALID_QUERY" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const result = await getPool().query<{ as_of_date: Date | string; generated_at: Date | string; payload: unknown }>(
      "SELECT as_of_date, generated_at, payload FROM us_obv_divergence_snapshot WHERE singleton = true LIMIT 1",
    );
    const row = result.rows[0];
    if (!row) return NextResponse.json({ ok: false, error: "SNAPSHOT_NOT_READY" }, { status: 503, headers: { "cache-control": "no-store" } });
    if (!isSnapshotPayload(row.payload)) return NextResponse.json({ ok: false, error: "INVALID_SNAPSHOT" }, { status: 503, headers: { "cache-control": "no-store" } });
    const generatedAt = row.generated_at instanceof Date ? row.generated_at : new Date(row.generated_at);
    if (!Number.isFinite(generatedAt.getTime()) || generatedAt.getTime() > Date.now() + 5 * 60 * 1_000
      || Date.now() - generatedAt.getTime() > MAX_SNAPSHOT_AGE_MS) {
      return NextResponse.json({ ok: false, error: "STALE_SNAPSHOT" }, { status: 503, headers: { "cache-control": "no-store" } });
    }

    const eligible = row.payload.items.filter((item) => (signalType === "ALL" || item.signalType === signalType)
      && (quality === "ALL" || item.signalQuality === quality)
      && item.avgDollarVolume20d >= minDollarVolume20d);
    const sorted = sortCandidates(eligible, sort);
    const totalItems = sorted.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const items = sorted.slice((page - 1) * pageSize, page * pageSize);
    return NextResponse.json({
      ok: true,
      ...row.payload,
      generatedAtUtc: generatedAt.toISOString(),
      items,
      pagination: { page, pageSize, totalItems, totalPages },
      filters: { signalType, quality, sort, minDollarVolume20d },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[API /scan/us-obv-divergence] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "SNAPSHOT_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
