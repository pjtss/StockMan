import { NextResponse } from "next/server";
import { fetchOpenDartFastFeed } from "@/lib/opendart-fast";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const payload = await fetchOpenDartFastFeed();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "OPEN DART 빠른 공시를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
