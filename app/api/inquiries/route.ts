import { NextResponse } from "next/server";
import { createInquiry, listInquiries } from "@/lib/inquiries";
import { getRequestIdentity, maskIp, summarizeUserAgent } from "@/lib/request-identity";
import { validateInquiryInput } from "@/lib/inquiry-validation";

export async function GET() {
  try {
    const rows = await listInquiries();
    return NextResponse.json(rows.map((row) => ({ ...row, ip_address: maskIp(row.ip_address), user_agent: summarizeUserAgent(row.user_agent) })));
  } catch {
    return NextResponse.json({ ok: false, error: "INQUIRIES_UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const input = validateInquiryInput(body.title, body.content);
  if (!input.ok) return NextResponse.json({ ok: false, error: input.error }, { status: 400 });
  try {
    const id = await createInquiry(input.title, input.content, getRequestIdentity(request));
    return NextResponse.json({ ok: true, id }, { status: 201 });
  } catch {
    return NextResponse.json({ ok: false, error: "INQUIRY_CREATE_FAILED" }, { status: 503 });
  }
}
