import { NextResponse } from "next/server";
import { AlpacaApiError } from "@/lib/alpaca-client";
import { normalizeAlpacaSymbol } from "@/lib/alpaca-short-borrow";
import { fetchShortBorrow } from "@/lib/short-borrow-service";
import { ensureSchema } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    await ensureSchema();
    if (!Array.isArray(body.stocks) || body.stocks.length > 100) return NextResponse.json({ code: "BATCH_LIMIT_EXCEEDED" }, { status: 400 });
    const stocks = [...new Map(body.stocks.map((item: any) => [normalizeAlpacaSymbol(String(item?.symbol || "")), item])).values()];
    const results = [];
    for (const item of stocks as Array<{ symbol: string; currentPrice?: number; requestedQty?: number }>) results.push(await fetchShortBorrow(String(item.symbol), { currentPrice: item.currentPrice, requestedQty: item.requestedQty }));
    results.sort((a, b) => b.pressureScore - a.pressureScore || (a.availableQtyChangePercent ?? 0) - (b.availableQtyChangePercent ?? 0));
    return NextResponse.json({ results });
  } catch (error) {
    const status = error instanceof AlpacaApiError ? error.status : error instanceof Error && error.message === "SYMBOL_INVALID" ? 400 : 500;
    return NextResponse.json({ code: error instanceof AlpacaApiError ? error.code : "SHORT_BORROW_BATCH_FAILED", message: error instanceof Error ? error.message : "배치 조회에 실패했습니다." }, { status });
  }
}
