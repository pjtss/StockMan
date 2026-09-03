import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { createNotice } from "@/lib/notices";

export async function POST(request: Request) {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    const id = await createNotice(body.title, body.content);
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const validation = ["제목과 내용을 입력해주세요.", "제목은 1~100자로 입력해주세요.", "내용은 1~5,000자로 입력해주세요."];
    return NextResponse.json({ error: validation.includes(message) ? message : "NOTICE_CREATE_FAILED" }, { status: validation.includes(message) ? 400 : 503 });
  }
}
