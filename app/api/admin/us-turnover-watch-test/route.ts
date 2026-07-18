import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { ensureSchema } from "@/lib/db";
import { testUsTurnoverWatch } from "@/lib/us-turnover-watch-test";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureSchema();
  return NextResponse.json(await testUsTurnoverWatch());
}
