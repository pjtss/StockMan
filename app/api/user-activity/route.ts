import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getRequestIdentity } from "@/lib/request-identity";

const allowedActions = new Set(["copy_json"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const feature = String(body.feature ?? "");
  const action = String(body.action ?? "");
  if (feature !== "news" || !allowedActions.has(action)) return NextResponse.json({ ok: false, error: "INVALID_ACTIVITY" }, { status: 400 });
  const identity = getRequestIdentity(request);
  try {
    await getPool().query("INSERT INTO request_logs(request_id,method,path,status_code,ip_address,user_agent,user_key,duration_ms,feature,action,resource,result) VALUES($1,'CLIENT_EVENT','/user-activity',200,$2,$3,$4,null,$5,$6,$7,$8)", [crypto.randomUUID(), identity.ip, identity.userAgent, identity.userKey, feature, action, String(body.resource ?? "").slice(0, 512), String(body.result ?? "success").slice(0, 32)]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "ACTIVITY_UNAVAILABLE" }, { status: 503 });
  }
}
