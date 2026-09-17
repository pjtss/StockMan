export type IpLocation = { countryCode: string | null; countryName: string | null; region: string | null; city: string | null; timezone: string | null; asn: number | null; org: string | null; source: string; confidence: string };

const UNKNOWN: IpLocation = { countryCode: null, countryName: null, region: null, city: null, timezone: null, asn: null, org: null, source: "unknown", confidence: "unknown" };
const CACHE_TTL_MS = 10 * 60_000;
const CACHE_MAX_ENTRIES = 1024;
const cache = new Map<string, { expiresAt: number; value: IpLocation }>();
const inflight = new Map<string, Promise<IpLocation>>();

export async function resolveIpLocation(ip: string): Promise<IpLocation> {
  if (!ip || ip === "unknown" || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip.includes(":")) return UNKNOWN;
  const cached = cache.get(ip);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (cached) cache.delete(ip);
  const existing = inflight.get(ip);
  if (existing) return existing;
  const endpoint = process.env.IP_GEOLOCATION_API_URL?.trim();
  if (!endpoint) return UNKNOWN;
  const request = (async () => {
    try {
      const response = await fetch(`${endpoint.replace(/\/$/, "")}/${encodeURIComponent(ip)}`, { cache: "no-store", signal: AbortSignal.timeout(Number(process.env.IP_GEOLOCATION_TIMEOUT_MS || 1500)) });
      if (!response.ok) return UNKNOWN;
      const body = await response.json() as Record<string, unknown>;
      const asn = Number(body.asn);
      return { countryCode: String(body.country_code || body.countryCode || "") || null, countryName: String(body.country || body.country_name || "") || null, region: String(body.region || "") || null, city: String(body.city || "") || null, timezone: String(body.timezone || "") || null, asn: Number.isFinite(asn) ? asn : null, org: String(body.org || body.organization || "") || null, source: "configured_api", confidence: "low" };
    } catch { return UNKNOWN; }
  })();
  inflight.set(ip, request);
  try {
    const value = await request;
    cache.set(ip, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    return value;
  } finally {
    if (inflight.get(ip) === request) inflight.delete(ip);
  }
}
