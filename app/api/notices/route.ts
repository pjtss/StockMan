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
    return NextResponse.json({ error: error instanceof Error ? error.message : "공지사항 등록에 실패했습니다." }, { status: 400 });
  }
}
