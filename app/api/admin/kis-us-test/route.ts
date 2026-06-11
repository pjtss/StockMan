import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { getAccessToken } from "@/lib/kis";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const excd = url.searchParams.get("excd") || "NAS";
  const gubn = url.searchParams.get("gubn") || "1";
  const nday = url.searchParams.get("nday") || "0";
  const volRang = url.searchParams.get("volRang") || "5";

  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 500 });
  }

  const params = new URLSearchParams({
    KEYB: process.env.KIS_APPKEY || "",
    AUTH: token,
    EXCD: excd,
    GUBN: gubn,
    NDAY: nday,
    VOL_RANG: volRang,
  });

  const baseUrl = "https://openapi.koreainvestment.com:9443";
  const trId = "HHDFS76290000";
  const targetUrl = `${baseUrl}/uapi/overseas-stock/v1/ranking/updown-rate?${params.toString()}`;

  const response = await fetch(targetUrl, {
    method: "GET",
    headers: {
      "content-type": "application/json; charset=utf-8",
      authorization: `Bearer ${token}`,
      appkey: process.env.KIS_APPKEY || "",
      appsecret: process.env.KIS_APPSECRET || "",
      tr_id: trId,
      custtype: "P",
      tr_cont: "",
    },
  });

  const rawText = await response.text();
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = null;
  }

  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    request: {
      method: "GET",
      url: targetUrl,
      headers: {
        authorization: "Bearer <masked>",
        appkey: "<masked>",
        appsecret: "<masked>",
        "content-type": "application/json; charset=utf-8",
        tr_id: trId,
        custtype: "P",
        tr_cont: "",
      },
    },
    response: {
      rawText,
      parsed,
    },
  });
}
