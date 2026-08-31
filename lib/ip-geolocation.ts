export type IpLocation = { countryCode: string | null; countryName: string | null; region: string | null; city: string | null; timezone: string | null; asn: number | null; org: string | null; source: string; confidence: string };

const UNKNOWN: IpLocation = { countryCode: null, countryName: null, region: null, city: null, timezone: null, asn: null, org: null, source: "unknown", confidence: "unknown" };

export async function resolveIpLocation(ip: string): Promise<IpLocation> {
  if (!ip || ip === "unknown" || /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip) || ip.includes(":")) return UNKNOWN;
  const endpoint = process.env.IP_GEOLOCATION_API_URL?.trim();
  if (!endpoint) return UNKNOWN;
  try {
    const response = await fetch(`${endpoint.replace(/\/$/, "")}/${encodeURIComponent(ip)}`, { cache: "no-store" });
    if (!response.ok) return UNKNOWN;
    const body = await response.json() as Record<string, unknown>;
    const asn = Number(body.asn);
    return { countryCode: String(body.country_code || body.countryCode || "") || null, countryName: String(body.country || body.country_name || "") || null, region: String(body.region || "") || null, city: String(body.city || "") || null, timezone: String(body.timezone || "") || null, asn: Number.isFinite(asn) ? asn : null, org: String(body.org || body.organization || "") || null, source: "configured_api", confidence: "low" };
  } catch { return UNKNOWN; }
}
