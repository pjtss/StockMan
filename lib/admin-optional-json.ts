export type OptionalJsonResult<T> = { value: T; available: true } | { value: null; available: false };

/** Load a non-critical dashboard section without failing its required sections. */
export async function fetchOptionalJson<T>(
  fetcher: typeof fetch,
  url: string,
): Promise<OptionalJsonResult<T>> {
  try {
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) return { value: null, available: false };
    return { value: (await response.json()) as T, available: true };
  } catch {
    return { value: null, available: false };
  }
}
