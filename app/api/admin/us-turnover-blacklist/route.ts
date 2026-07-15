import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { addUsTurnoverBlacklistTicker, loadUsTurnoverBlacklist, removeUsTurnoverBlacklistTicker } from "@/lib/us-turnover-blacklist";

async function authorized() { return await requireAdminSession(); }

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ tickers: await loadUsTurnoverBlacklist() });
}

export async function POST(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    await addUsTurnoverBlacklistTicker(body.ticker);
    return NextResponse.json({ success: true, tickers: await loadUsTurnoverBlacklist() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  await removeUsTurnoverBlacklistTicker(body.ticker);
  return NextResponse.json({ success: true, tickers: await loadUsTurnoverBlacklist() });
}
