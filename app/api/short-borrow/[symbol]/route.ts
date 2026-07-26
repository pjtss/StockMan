import { NextResponse } from "next/server";
import { AlpacaApiError } from "@/lib/alpaca-client";
import { fetchShortBorrow } from "@/lib/short-borrow-service";
import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ symbol: string }> }) {
  try {
    const { symbol } = await context.params;
    await ensureSchema();
    const url = new URL(request.url);
    const currentPrice = url.searchParams.has("currentPrice") ? Number(url.searchParams.get("currentPrice")) : undefined;
    const requestedQty = url.searchParams.has("requestedQty") ? Number(url.searchParams.get("requestedQty")) : undefined;
    if (currentPrice !== undefined && (!Number.isFinite(currentPrice) || currentPrice <= 0)) return NextResponse.json({ code: "INVALID_CURRENT_PRICE" }, { status: 400 });
    if (requestedQty !== undefined && (!Number.isInteger(requestedQty) || requestedQty <= 0)) return NextResponse.json({ code: "INVALID_REQUESTED_QTY" }, { status: 400 });
    const data = await fetchShortBorrow(symbol, { currentPrice, requestedQty });
    return NextResponse.json(data);
  } catch (error) {
    const status = error instanceof AlpacaApiError ? (error.status === 429 ? 429 : error.status >= 500 ? 502 : error.status) : error instanceof Error && error.message === "SYMBOL_INVALID" ? 400 : 500;
    const code = error instanceof AlpacaApiError ? error.code : error instanceof Error && error.message === "SYMBOL_INVALID" ? "SYMBOL_INVALID" : "SHORT_BORROW_FAILED";
    console.error("[ShortBorrow] lookup failed:", code, error instanceof Error ? error.message : error);
    return NextResponse.json({ code, message: error instanceof Error ? error.message : "공매도 대차 정보를 조회하지 못했습니다." }, { status });
  }
}
