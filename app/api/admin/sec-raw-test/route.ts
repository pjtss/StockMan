import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { buildSecAiPayload } from "@/lib/sec-ai-payload";
import { fetchSecRawDocument } from "@/lib/sec-raw-document";
import { parseSecItems } from "@/lib/rss";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("url") || "";
  if (!sourceUrl) {
    return NextResponse.json({ error: "url query parameter is required" }, { status: 400 });
  }

  const document = await fetchSecRawDocument(sourceUrl);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const parsed = parseSecItems(document.html, today);
  const firstItem = parsed.items[0] || null;
  const aiPayload = firstItem ? await buildSecAiPayload(firstItem) : null;

  return NextResponse.json({
    ok: true,
    status: 200,
    request: {
      method: "GET",
      url: sourceUrl,
    },
    document: {
      html: document.html,
      text: document.text,
    },
    parsed,
    aiPayload,
  });
}
