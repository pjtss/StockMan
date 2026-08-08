import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-auth";
import { buildSecAiPayloadFromDocument } from "@/lib/sec-ai-payload";
import { evaluateSecFilingWithAi } from "@/lib/sec-ai-evaluator";
import { prepareSecDocument } from "@/lib/sec-document-parser";
import { isSecHttpsUrl, parseSecFilingUrl } from "@/lib/sec-filing-url";
import { fetchSecPrimaryDocument } from "@/lib/sec-primary-document";
import { describeError } from "@/lib/error-diagnostics";
import type { SecItem } from "@/lib/types";

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

  const requestedUrlInfo = parseSecFilingUrl(sourceUrl);
  const formType = url.searchParams.get("formType")?.trim().toUpperCase() || "8-K";
  const secItem: SecItem = {
    source: "SEC",
    accession: requestedUrlInfo.accessionNumber,
    company: "",
    formType,
    sentiment: "중요공시",
    publishedAt: new Date().toISOString(),
    title: formType,
    summary: "",
    link: requestedUrlInfo.canonicalUrl,
  };

  try {
    // SEC feed links commonly point to the filing index. Resolve that index
    // to the primary document before parsing so the debug result matches the
    // production filing processor.
    const resolved = await fetchSecPrimaryDocument(secItem);
    const urlInfo = resolved.urlInfo;
    const document = resolved.document;
    const prepared = prepareSecDocument(document.html, urlInfo);
    const aiPayload = buildSecAiPayloadFromDocument(urlInfo.canonicalUrl, document.html, undefined, urlInfo);
    const aiEvaluation = await evaluateSecFilingWithAi(aiPayload).catch((error) => ({
      skipped: true as const,
      reason: error instanceof Error ? error.message : "AI evaluation failed",
    }));

    return NextResponse.json({
      ok: true,
      status: 200,
      request: {
        method: "GET",
        url: urlInfo.canonicalUrl,
        originalUrl: sourceUrl,
        formType,
      },
      urlInfo,
      resolution: {
        indexUrl: resolved.indexUrl,
        primaryDocumentResolved: resolved.indexUrl !== urlInfo.canonicalUrl,
      },
      document: {
        htmlLength: document.html.length,
        htmlPreview: document.html.slice(0, 2000),
        textLength: prepared.fullText.length,
        text: prepared.fullText,
        aiTextLength: prepared.aiText.length,
        aiText: prepared.aiText,
        promptText: aiPayload.promptText,
        metadata: prepared.metadata,
        sections: prepared.sections,
        events: aiPayload.events,
      },
      aiPayload,
      aiEvaluation,
    });
  } catch (error) {
    const diagnostics = describeError(error);
    return NextResponse.json({
      ok: false,
      status: 502,
      stage: "fetch_resolve_or_parse",
      request: { method: "GET", url: requestedUrlInfo.canonicalUrl, originalUrl: sourceUrl, formType },
      ...diagnostics,
      checkedAt: new Date().toISOString(),
    }, { status: 502 });
  }
}
