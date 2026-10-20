/**
 * Maps an ordered list with bounded concurrency and preserves result order.
 * On failure, no new work is assigned; already-running tasks settle before the
 * first error is rethrown so callers can safely handle partial side effects.
 */
export async function mapWithConcurrency<T, Result>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<Result>,
): Promise<Result[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError("concurrency must be a positive integer");
  }

  const results = new Array<Result>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  const worker = async () => {
    while (!failed) {
      const index = nextIndex++;
      if (index >= items.length) return;
      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  if (failed) throw firstError;
  return results;
}
