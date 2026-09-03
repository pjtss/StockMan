import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { fetchKisUsPriceDetail } from "@/lib/kis-us-price-detail";
import { loadKisApiConfig } from "@/lib/kis-api-config";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const code = (params.get("code") || "").trim().toUpperCase();
  const market = (params.get("market") || "AMS").trim().toUpperCase();
  if (!code) return NextResponse.json({ error: "종목코드를 입력하세요." }, { status: 400 });
  if (!["AMS", "NAS", "NYSE"].includes(market)) return NextResponse.json({ error: "지원하지 않는 거래소입니다." }, { status: 400 });

  if (code.length > 32 || !/^[A-Z0-9./_-]+$/.test(code)) return NextResponse.json({ error: "유효하지 않은 종목코드입니다." }, { status: 400 });
  try {
    const config = await loadKisApiConfig("us_price_detail");
    const query = new URLSearchParams({ AUTH: "", EXCD: market, SYMB: code });
    const result = await fetchKisUsPriceDetail({ code, market });
    if (!result) return NextResponse.json({ error: "KIS access token is unavailable" }, { status: 503 });
    return NextResponse.json({
    ok: result.ok,
    status: result.status,
    request: {
      method: "GET",
      url: `https://openapi.koreainvestment.com:9443/uapi/overseas-price/v1/quotations/price-detail?${query.toString()}`,
      headers: {
        "content-type": config.content_type || "application/json; charset=utf-8",
        Authorization: "Bearer <masked>",
        appkey: "<masked>",
        appsecret: "<masked>",
        tr_id: config.tr_id || "HHDFS76200200",
        custtype: config.custtype || "P",
        tr_cont: "",
      },
    },
    response: { parsed: result.parsed },
    });
  } catch (error) {
    console.error("[API /admin/kis-us-price-detail-test] Error:", error instanceof Error ? error.message.slice(0, 1000) : "unknown error");
    return NextResponse.json({ ok: false, error: "KIS_US_PRICE_DETAIL_UNAVAILABLE" }, { status: 502 });
  }
}
