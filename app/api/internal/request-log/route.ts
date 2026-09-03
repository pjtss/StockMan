import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getRequestIdentity } from "@/lib/request-identity";
import { getRequestLogSecret } from "@/lib/request-log-config";
import { resolveIpLocation } from "@/lib/ip-geolocation";

export async function POST(request: Request) {
  const expected = getRequestLogSecret();
  if (!expected || request.headers.get("x-request-log-secret") !== expected) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const identity = getRequestIdentity(request);
  const clip = (value: unknown, max: number) => String(value ?? "").slice(0, max);
  let geo: Awaited<ReturnType<typeof resolveIpLocation>> = { countryCode: null, countryName: null, region: null, city: null, timezone: null, asn: null, org: null, source: "none", confidence: "low" };
  try {
    geo = { ...geo, ...(await resolveIpLocation(identity.ip)) };
  } catch {
    // Geolocation is optional; request logging must remain best-effort.
  }
  try {
    await getPool().query("INSERT INTO request_logs(request_id,method,path,status_code,ip_address,user_agent,user_key,duration_ms,geo_country_code,geo_country_name,geo_region,geo_city,geo_timezone,geo_asn,geo_org,geo_source,geo_confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", [clip(request.headers.get("x-request-id") || crypto.randomUUID(), 128), clip(body.method || "GET", 16), clip(body.path || "/", 512), null, clip(identity.ip, 128), clip(identity.userAgent, 1024), identity.userKey, null, clip(geo.countryCode, 64), clip(geo.countryName, 128), clip(geo.region, 128), clip(geo.city, 128), clip(geo.timezone, 128), clip(geo.asn, 128), clip(geo.org, 256), clip(geo.source, 64), geo.confidence]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "REQUEST_LOG_UNAVAILABLE" }, { status: 503 });
  }
}
