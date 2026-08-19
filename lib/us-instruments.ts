/**
 * Legacy compatibility boundary. The old `us_instruments` table is removed;
 * new code must use `us_instrument_universe`. Kept only so unrelated legacy
 * imports fail closed until their feature routes are retired.
 */
export async function ensureUsInstrument(_input: { market: string; code: string; name?: string; englishName?: string; productType?: string }) {
  return null;
}
