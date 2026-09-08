import { eq, and, desc } from "drizzle-orm";
import { getDb } from "./db";
import { kisSignalSnapshots } from "./schema";

export type KisSignalSnapshotInput = {
  market: string;
  code: string;
  signalType: string;
  status: string;
  observedAt?: Date;
  payload: unknown;
  rawPayload?: string;
};

export async function writeKisSignalSnapshot(input: KisSignalSnapshotInput) {
  const db = getDb();
  if (!db) return;
  await db.insert(kisSignalSnapshots).values({
    market: input.market,
    code: input.code,
    signalType: input.signalType,
    status: input.status,
    observedAt: input.observedAt ?? new Date(),
    payload: input.payload,
    rawPayload: input.rawPayload ?? "",
  });
}

export async function readLatestKisSignalSnapshot(market: string, code: string, signalType: string) {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select().from(kisSignalSnapshots).where(and(eq(kisSignalSnapshots.market, market), eq(kisSignalSnapshots.code, code), eq(kisSignalSnapshots.signalType, signalType))).orderBy(desc(kisSignalSnapshots.observedAt)).limit(1);
  return rows[0] ?? null;
}
