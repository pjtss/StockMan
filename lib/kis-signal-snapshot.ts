import { eq } from "drizzle-orm";
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
