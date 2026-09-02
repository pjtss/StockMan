import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/user-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ authenticated: Boolean(user), user: user ? { id: user.id, username: user.username } : null }, { headers: { "cache-control": "no-store" } });
}
