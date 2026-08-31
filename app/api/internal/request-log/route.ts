import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getRequestIdentity } from "@/lib/request-identity";
import { getRequestLogSecret } from "@/lib/request-log-config";

export async function POST(request: Request) {
  const expected = getRequestLogSecret();
  if (!expected || request.headers.get("x-request-log-secret") !== expected) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const identity = getRequestIdentity(request);
  await getPool().query("INSERT INTO request_logs(request_id,method,path,status_code,ip_address,user_agent,user_key,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [request.headers.get("x-request-id") || crypto.randomUUID(), String(body.method || "GET"), String(body.path || "/"), null, identity.ip, identity.userAgent, identity.userKey, null]);
  return NextResponse.json({ ok: true });
}
