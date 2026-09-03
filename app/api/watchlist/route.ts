import { NextResponse } from "next/server";
import { addUserWatchlistItem, getUserWatchlist, removeUserWatchlistItem } from "@/lib/user-watchlist";

function validMarket(value: unknown): value is "KR" | "US" { return value === "KR" || value === "US"; }
const invalidItem = () => NextResponse.json({ ok: false, error: "INVALID_ITEM" }, { status: 400 });
async function readItem(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const market = (body as Record<string, unknown>).market;
    const rawCode = (body as Record<string, unknown>).code;
    if (typeof rawCode !== "string") return null;
    const code = rawCode.trim().toUpperCase();
    if (!validMarket(market) || !code || code.length > 32) return null;
    return { market, code } as { market: "KR" | "US"; code: string };
  } catch {
    return null;
  }
}
export async function GET() { try { const items = await getUserWatchlist(); return items ? NextResponse.json({ ok: true, items }) : NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }); } catch { return NextResponse.json({ ok: false, error: "WATCHLIST_UNAVAILABLE" }, { status: 503 }); } }
export async function POST(request: Request) { try { const item = await readItem(request); if (!item) return invalidItem(); const saved = await addUserWatchlistItem(item.market, item.code); return saved ? NextResponse.json({ ok: true, item: saved }, { status: 201 }) : NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }); } catch { return NextResponse.json({ ok: false, error: "WATCHLIST_UNAVAILABLE" }, { status: 503 }); } }
export async function DELETE(request: Request) { try { const item = await readItem(request); if (!item) return invalidItem(); const removed = await removeUserWatchlistItem(item.market, item.code); return removed ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 }); } catch { return NextResponse.json({ ok: false, error: "WATCHLIST_UNAVAILABLE" }, { status: 503 }); } }
