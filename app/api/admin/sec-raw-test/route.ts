import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { buildSecAiPayloadFromDocument } from "@/lib/sec-ai-payload";
import { prepareSecDocument } from "@/lib/sec-document-parser";
import { isSecHttpsUrl, parseSecFilingUrl } from "@/lib/sec-filing-url";
import { fetchSecRawDocument } from "@/lib/sec-raw-document";

export async function GET(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sourceUrl = url.searchParams.get("url") || "";
  if (!sourceUrl) {
    return NextResponse.json({ error: "url query parameter is required" }, { status: 400 });
  }
  if (!isSecHttpsUrl(sourceUrl)) {
    return NextResponse.json({ error: "SEC 도메인의 HTTPS URL만 허용됩니다." }, { status: 400 });
  }

  const urlInfo = parseSecFilingUrl(sourceUrl);
  const document = await fetchSecRawDocument(urlInfo.canonicalUrl);
  const prepared = prepareSecDocument(document.html, urlInfo);
  const aiPayload = buildSecAiPayloadFromDocument(urlInfo.canonicalUrl, document.html, undefined, urlInfo);

  return NextResponse.json({
    ok: true,
    status: 200,
    request: {
      method: "GET",
      url: urlInfo.canonicalUrl,
      originalUrl: sourceUrl,
    },
    urlInfo,
    document: {
      htmlLength: document.html.length,
      htmlPreview: document.html.slice(0, 2000),
      textLength: prepared.fullText.length,
      text: prepared.fullText,
      aiTextLength: prepared.aiText.length,
      aiText: prepared.aiText,
      promptText: prepared.promptText,
      metadata: prepared.metadata,
      sections: prepared.sections,
    },
    aiPayload,
  });
}
