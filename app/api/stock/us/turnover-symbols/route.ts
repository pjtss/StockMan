import { NextResponse } from "next/server";
import { loadUsTurnoverSymbols, saveUsTurnoverSymbols } from "@/lib/us-turnover-symbols";

export async function GET() {
  const symbols = await loadUsTurnoverSymbols();
  return NextResponse.json({ symbols });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const symbols = Array.isArray(body.symbols) ? body.symbols : [];
  const saved = await saveUsTurnoverSymbols(symbols);
  return NextResponse.json({ success: true, symbols: saved });
}
