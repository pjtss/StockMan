import crypto from "node:crypto";

export type DebugContext = {
  requestId: string;
  runId?: string;
  feature: string;
  market?: "KR" | "US" | string;
  code?: string;
  timeframe?: "D" | "W" | "M" | string;
  attempt?: number;
  startedAt: string;
};

export function createDebugContext(input: Omit<DebugContext, "requestId" | "startedAt"> & { requestId?: string; startedAt?: string }): DebugContext {
  return { ...input, requestId: input.requestId ?? `req_${crypto.randomUUID()}`, startedAt: input.startedAt ?? new Date().toISOString() };
}

export function childDebugContext(parent: DebugContext, changes: Partial<Omit<DebugContext, "requestId" | "startedAt">>): DebugContext {
  return createDebugContext({ ...parent, ...changes, requestId: parent.requestId, startedAt: parent.startedAt });
}
