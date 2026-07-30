export type UsTurnoverSnapshotState = "NEW" | "CONTINUING" | "RECOVERED" | "INSUFFICIENT" | "STALE";

export function classifyUsTurnoverSnapshotState(input: { hasCurrentSessionSnapshot: boolean; hadPreviousSessionSnapshot: boolean; hasComparisonSnapshot: boolean; lastObservedAt?: Date | null; now?: Date; staleAfterSeconds?: number }): UsTurnoverSnapshotState {
  if (input.lastObservedAt) {
    const staleAfterSeconds = Math.max(1, input.staleAfterSeconds ?? 180);
    const now = input.now ?? new Date();
    if (now.getTime() - input.lastObservedAt.getTime() > staleAfterSeconds * 1000) return "STALE";
  }
  if (!input.hasComparisonSnapshot) return "INSUFFICIENT";
  if (input.hasCurrentSessionSnapshot) return "CONTINUING";
  if (input.hadPreviousSessionSnapshot) return "RECOVERED";
  return "NEW";
}
