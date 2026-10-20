import { describeError } from "./error-diagnostics";

export type MarketRssIngestSourceOutcome<T> =
  | { source: string; ok: true; value: T }
  | { source: string; ok: false; error: ReturnType<typeof describeError> };

/** Convert a per-source archive/transform/database error into a failure value so sibling feeds can continue. */
export async function runMarketRssIngestSource<T>(source: string, operation: () => Promise<T>): Promise<MarketRssIngestSourceOutcome<T>> {
  try {
    return { source, ok: true, value: await operation() };
  } catch (error) {
    return { source, ok: false, error: describeError(error) };
  }
}
