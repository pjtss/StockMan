import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { kisRealtimeEvents } from "./schema";

export type KisRealtimeEventInput = {
  market: "KR" | "US";
  code: string;
  channel: "trade" | "asking";
  trId: string;
  payload: unknown;
  rawPayload?: string;
  observedAt?: Date;
};

function normalizeRealtimeCode(market: "KR" | "US", code: string) {
  const trimmed = code.trim();
  const unprefixed = market === "US" ? trimmed.replace(/^US:/i, "") : trimmed;
  return unprefixed.toUpperCase();
}

export async function writeKisRealtimeEvent(input: KisRealtimeEventInput) {
  const db = getDb();
  if (!db) throw new Error("KIS_REALTIME_EVENT_DATABASE_UNAVAILABLE");
  await db.insert(kisRealtimeEvents).values({
    market: input.market,
    code: normalizeRealtimeCode(input.market, input.code),
    channel: input.channel,
    trId: input.trId,
    observedAt: input.observedAt ?? new Date(),
    payload: input.payload,
    rawPayload: input.rawPayload ?? "",
  });
}

export async function readLatestKisRealtimeEvent(market: "KR" | "US", code: string, channel: "trade" | "asking") {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(kisRealtimeEvents).where(and(eq(kisRealtimeEvents.market, market), eq(kisRealtimeEvents.code, normalizeRealtimeCode(market, code)), eq(kisRealtimeEvents.channel, channel))).orderBy(desc(kisRealtimeEvents.observedAt)).limit(1);
  return rows[0] ?? null;
}
