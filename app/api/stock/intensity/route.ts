import { NextResponse } from "next/server";
import { fetchTradingIntensity } from "@/lib/kis";

export async function GET() {
  try {
    const data = await fetchTradingIntensity();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch intensity" }, { status: 500 });
  }
}
