import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({ authenticated: Boolean(user), user: user ? { id: user.id, username: user.username } : null }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ authenticated: false, user: null, error: "AUTH_STATUS_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
