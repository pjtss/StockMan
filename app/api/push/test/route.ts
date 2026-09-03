import { NextResponse } from "next/server";
import { ensureSchema } from "@/lib/db";
import { sendTestPush } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await ensureSchema();
    await sendTestPush();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[API /push/test] Error:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ error: "테스트 푸시 발송에 실패했습니다." }, { status: 503 });
  }
}
