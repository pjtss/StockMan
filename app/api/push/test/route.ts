import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "PUSH_TEST_UNAVAILABLE", message: "현재 기기만 대상으로 하는 안전한 테스트 발송을 사용할 수 없습니다." },
    { status: 503 },
  );
}
