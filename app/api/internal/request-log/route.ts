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
  const geo = await resolveIpLocation(identity.ip);
  await getPool().query("INSERT INTO request_logs(request_id,method,path,status_code,ip_address,user_agent,user_key,duration_ms,geo_country_code,geo_country_name,geo_region,geo_city,geo_timezone,geo_asn,geo_org,geo_source,geo_confidence) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)", [request.headers.get("x-request-id") || crypto.randomUUID(), String(body.method || "GET"), String(body.path || "/"), null, identity.ip, identity.userAgent, identity.userKey, null, geo.countryCode, geo.countryName, geo.region, geo.city, geo.timezone, geo.asn, geo.org, geo.source, geo.confidence]);
  return NextResponse.json({ ok: true });
}
