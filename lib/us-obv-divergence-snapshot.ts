import { getPool } from "@/lib/db";
import { normalizeCandleDate } from "@/lib/us-obv-divergence";
import { findLatestCompletedUsDailyDate, scanUsObvDivergenceWithClient } from "@/lib/us-obv-divergence-scan";

const PARTIAL_RETRY_COOLDOWN_MS = 30 * 60 * 1_000;
type StoredSnapshot = { as_of_date: string; generated_at: Date | string; payload: unknown };

function parseTimestamp(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function isoDate(value: string | Date | null): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return normalizeCandleDate(value);
}

function easternClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.weekday,
    date: `${values.year}-${values.month}-${values.day}`,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

export type RefreshResult = {
  ok: true;
  skipped?: true;
  reason?: string;
  asOfEtDate?: string;
  scanStatus?: "COMPLETE" | "PARTIAL";
  universe?: Record<string, unknown>;
  candidateCount?: number;
  instrumentCount?: number;
  failureCount?: number;
};

export async function refreshUsObvDivergenceSnapshot(now = new Date()): Promise<RefreshResult> {
  const clock = easternClock(now);
  if (["Sat", "Sun"].includes(clock.weekday)) return { ok: true, skipped: true, reason: "US_MARKET_WEEKEND" };
  if (clock.minutes < 18 * 60 + 10) return { ok: true, skipped: true, reason: "BEFORE_DAILY_DATA_SETTLEMENT_WINDOW" };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('us-obv-divergence-snapshot')) AS locked",
    );
    if (!lock.rows[0]?.locked) {
      await client.query("ROLLBACK");
      return { ok: true, skipped: true, reason: "REFRESH_ALREADY_RUNNING" };
    }

    const asOfEtDate = await findLatestCompletedUsDailyDate(client, clock.date);
    if (!asOfEtDate) throw new Error("NO_COMPLETED_US_DAILY_CANDLES");

    const previous = await client.query<StoredSnapshot>(
      "SELECT as_of_date, generated_at, payload FROM us_obv_divergence_snapshot WHERE singleton = true FOR UPDATE",
    );
    const previousRow = previous.rows[0];
    if (previousRow) {
      const previousDate = isoDate(previousRow.as_of_date);
      const previousPayload = previousRow.payload as { scanStatus?: string } | null;
      const previousGeneratedAt = parseTimestamp(previousRow.generated_at).getTime();
      if (previousDate && previousDate >= asOfEtDate && previousPayload?.scanStatus === "COMPLETE") {
        await client.query("COMMIT");
        return { ok: true, skipped: true, reason: "SNAPSHOT_ALREADY_CURRENT", asOfEtDate };
      }
      if (previousDate === asOfEtDate && previousPayload?.scanStatus === "PARTIAL"
        && Number.isFinite(previousGeneratedAt) && now.getTime() - previousGeneratedAt < PARTIAL_RETRY_COOLDOWN_MS) {
        await client.query("COMMIT");
        return { ok: true, skipped: true, reason: "PARTIAL_SNAPSHOT_RETRY_COOLDOWN", asOfEtDate };
      }
    }

    const payload = await scanUsObvDivergenceWithClient(client, asOfEtDate, now);

    await client.query(
      `INSERT INTO us_obv_divergence_snapshot (singleton, as_of_date, generated_at, scan_status, universe_count, evaluated_count, payload)
       VALUES (true, $1::date, $2::timestamptz, $3, $4, $5, $6::jsonb)
       ON CONFLICT (singleton) DO UPDATE SET as_of_date = EXCLUDED.as_of_date,
         generated_at = EXCLUDED.generated_at, scan_status = EXCLUDED.scan_status,
         universe_count = EXCLUDED.universe_count, evaluated_count = EXCLUDED.evaluated_count,
         payload = EXCLUDED.payload`,
      [asOfEtDate, payload.generatedAtUtc, payload.scanStatus, payload.universe.eligibleCommonStockCount, payload.universe.evaluatedCount, JSON.stringify(payload)],
    );
    await client.query("COMMIT");
    return { ok: true, asOfEtDate, scanStatus: payload.scanStatus, universe: payload.universe, candidateCount: payload.items.length,
      instrumentCount: payload.universe.eligibleCommonStockCount, failureCount: payload.universe.missingOrInvalidCount };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* transaction may already be closed */ }
    throw error;
  } finally {
    client.release();
  }
}
