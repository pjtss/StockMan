import { NextRequest, NextResponse } from "next/server";
import openApi from "@/public/openapi.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type JsonSchema = Record<string, unknown>;
type OpenApiParameter = { name: string; in: string; required?: boolean; description?: string; schema?: JsonSchema };
type OpenApiResponse = { description?: string; content?: Record<string, { schema?: JsonSchema }> };
type OpenApiOperation = {
  operationId?: string;
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: unknown;
  responses?: Record<string, OpenApiResponse>;
  security?: unknown[];
  "x-code-path"?: string;
  "x-access-classification"?: string;
};

const categories = [
  { id: "disclosure-news", title: "뉴스·공시", description: "RSS, DART, SEC 및 티커 뉴스 조회" },
  { id: "market-data", title: "시세·종목 데이터", description: "시세, 캔들, 종목 정보, 수급 및 거래 데이터" },
  { id: "screeners", title: "스캐너·지표", description: "시장별 종목 후보, 스캐너와 기술 지표 조회" },
  { id: "market-events", title: "시장 영향 이벤트", description: "공시 기반 일별 영향 이벤트와 통합 정보" },
  { id: "system", title: "서비스 상태·설정", description: "공개 상태 및 설정 조회" },
];

function categoryFor(path: string) {
  if (path === "/api/health" || path === "/api/automation-settings") return "system";
  if (path.startsWith("/api/scan/") || /^\/api\/stock\/us\/(?:ams-scout|dmi|macd|mfi-oversold)$/.test(path)) return "screeners";
  if (path.includes("market-impact-events") || path === "/api/public/market-intelligence") return "market-events";
  if (path.startsWith("/api/dart") || path === "/api/disclosures" || path === "/api/market-news" || /\/news(?:-radar)?$/.test(path)) return "disclosure-news";
  return "market-data";
}

function decodeCursor(value: string | null): { offset: number; scope: string } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Number.isSafeInteger(parsed.offset) || parsed.offset < 0 || typeof parsed.scope !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function responseContract(responses: OpenApiOperation["responses"]) {
  return Object.entries(responses ?? {}).map(([status, response]) => {
    const content = Object.entries(response.content ?? {}).map(([contentType, contract]) => ({ contentType, schema: contract.schema ?? null }));
    const hasUsefulSchema = content.some(({ schema }) => schema && typeof schema === "object" &&
      ((Array.isArray(schema.required) && schema.required.length > 0) || (schema.properties && Object.keys(schema.properties as object).length > 0)));
    return {
      status: /^\d+$/.test(status) ? Number(status) : status,
      description: response.description ?? "",
      content,
      detail: hasUsefulSchema ? "schema" : content.length ? "generic-schema" : "status-only",
    };
  });
}

function operationList(): Array<Record<string, unknown>> {
  return Object.entries(openApi.paths ?? {}).flatMap(([path, pathItem]) =>
    Object.entries(pathItem ?? {}).filter(([method]) => method.toUpperCase() === "GET").map(([method, value]) => {
      const operation = value as OpenApiOperation;
      const parameters = operation.parameters ?? [];
      const documentedPathParameters = parameters.filter((parameter) => parameter.in === "path");
      const pathParameters = documentedPathParameters.length > 0
        ? documentedPathParameters
        : [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: "path", required: true, description: "경로 변수입니다.", schema: { type: "string" } }));
      return {
        id: operation.operationId ?? `${method.toLowerCase()}-${path.replace(/[^a-zA-Z0-9]+/g, "-")}`,
        path,
        method: method.toUpperCase(),
        category: categoryFor(path),
        tags: operation.tags ?? [],
        summary: operation.summary ?? path,
        description: operation.description ?? "",
        request: {
          pathParameters,
          queryParameters: parameters.filter((parameter) => parameter.in === "query"),
          headers: parameters.filter((parameter) => parameter.in === "header"),
          body: operation.requestBody ?? null,
        },
        authentication: {
          required: Array.isArray(operation.security) && operation.security.length > 0,
          schemes: operation.security ?? [],
          accessClassification: operation["x-access-classification"] ?? "unspecified",
        },
        responses: responseContract(operation.responses),
        sourcePath: operation["x-code-path"] ?? null,
        sourceUrl: operation["x-code-path"]
          ? `https://raw.githubusercontent.com/pjtss/StockMan/oci/${String(operation["x-code-path"]).split("/").map(encodeURIComponent).join("/")}`
          : null,
        responseDocumentation: responseContract(operation.responses).some((response) => response.detail === "generic-schema")
          ? "일부 응답 DTO는 현재 OpenAPI에서 일반 object로만 표현됩니다. 실제 필드 계약은 상세 매뉴얼 또는 sourcePath의 route 구현을 확인하세요."
          : "응답 구조는 responses.content.schema를 기준으로 확인하세요.",
      };
    }),
  ).sort((a, b) => String(a.path).localeCompare(String(b.path), "en"));
}

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const requestedTag = searchParams.get("tag")?.trim() ?? "";
  const tag = requestedTag || null;
  const requestedCategory = searchParams.get("category")?.trim() ?? "";
  const category = requestedCategory || null;
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT", message: "limit must be an integer between 1 and 100." }, { status: 400 });
  }

  const operations = operationList();
  const tags = [...new Set(operations.flatMap((operation) => operation.tags as string[]))].sort();
  if (tag && !tags.includes(tag)) return NextResponse.json({ ok: false, error: "INVALID_TAG", tags }, { status: 400 });
  if (category && !categories.some((item) => item.id === category)) return NextResponse.json({ ok: false, error: "INVALID_CATEGORY", categories: categories.map((item) => item.id) }, { status: 400 });
  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const scope = JSON.stringify([normalizedQuery, tag, category]);
  const cursor = decodeCursor(searchParams.get("cursor"));
  if (searchParams.has("cursor") && !cursor) return NextResponse.json({ ok: false, error: "INVALID_CURSOR" }, { status: 400 });
  if (cursor && cursor.scope !== scope) return NextResponse.json({ ok: false, error: "CURSOR_SCOPE_MISMATCH" }, { status: 400 });

  const matched = operations.filter((operation) => {
    if (tag && !(operation.tags as string[]).includes(tag)) return false;
    if (category && operation.category !== category) return false;
    if (!normalizedQuery) return true;
    const categoryTitle = categories.find((item) => item.id === operation.category)?.title ?? "";
    return [operation.path, operation.summary, operation.description, operation.sourcePath, operation.category, categoryTitle, ...(operation.tags as string[])].join(" ").toLocaleLowerCase("ko-KR").includes(normalizedQuery);
  });
  const offset = cursor?.offset ?? 0;
  const items = matched.slice(offset, offset + rawLimit);
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < matched.length
    ? Buffer.from(JSON.stringify({ offset: nextOffset, scope }), "utf8").toString("base64url")
    : null;

  return NextResponse.json({
    ok: true,
    schemaVersion: "stockman-public-api-manual.v1",
    source: "/openapi.json",
    openApiVersion: openApi.openapi,
    query: { q: query || null, tag, category, limit: rawLimit },
    tags,
    categories,
    total: matched.length,
    returned: items.length,
    items,
    nextCursor,
    notes: [
      "목록에는 OpenAPI에 등록된 무인증 외부 GET operation만 포함합니다.",
      "GET 요청은 query/path/header를 사용하며 body는 일반적으로 없습니다. 실제 operation 계약을 확인하세요.",
      "generic-schema 표시는 OpenAPI가 응답 DTO 필드를 완전히 기술하지 않는다는 뜻입니다.",
    ],
  }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } });
}
