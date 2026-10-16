/** Parse an integer query parameter and clamp it to a safe inclusive range. */
export function boundedIntegerQuery(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = raw === null || raw.trim() === "" ? Number.NaN : Number(raw);
  const value = !Number.isFinite(parsed) || parsed === 0 ? fallback : Math.trunc(parsed);
  return Math.min(max, Math.max(min, value));
}
