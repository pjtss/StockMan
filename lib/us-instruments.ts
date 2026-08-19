/**
 * Compatibility boundary for scanners that are being retired. The legacy
 * `us_instruments` table is intentionally gone; callers fail closed and never
 * create or read a legacy record.
 */
export async function ensureUsInstrument(_input: { market: string; code: string; name?: string; englishName?: string; productType?: string }) {
  return null;
}
