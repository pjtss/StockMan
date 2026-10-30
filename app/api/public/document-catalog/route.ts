import { NextRequest, NextResponse } from "next/server";
import catalog from "@/public/document-catalog.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CatalogDocument = (typeof catalog.documents)[number];

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

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim().slice(0, 120) ?? "";
  const requestedCategory = searchParams.get("category")?.trim() ?? "";
  const category = requestedCategory || null;
  const rawLimit = Number(searchParams.get("limit") ?? 20);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) {
    return NextResponse.json({ ok: false, error: "INVALID_LIMIT", message: "limit must be an integer between 1 and 100." }, { status: 400 });
  }
  if (category && !catalog.categories.some((item) => item.id === category)) {
    return NextResponse.json({ ok: false, error: "INVALID_CATEGORY", categories: catalog.categories.map((item) => item.id) }, { status: 400 });
  }

  const normalizedQuery = query.toLocaleLowerCase("ko-KR");
  const scope = JSON.stringify([normalizedQuery, category]);
  const cursor = decodeCursor(searchParams.get("cursor"));
  if (searchParams.has("cursor") && !cursor) {
    return NextResponse.json({ ok: false, error: "INVALID_CURSOR" }, { status: 400 });
  }
  if (cursor && cursor.scope !== scope) {
    return NextResponse.json({ ok: false, error: "CURSOR_SCOPE_MISMATCH" }, { status: 400 });
  }

  const matched = (catalog.documents as CatalogDocument[]).filter((document) => {
    if (category && document.category !== category) return false;
    if (!normalizedQuery) return true;
    const searchable = [document.title, document.category, document.description, document.sourcePath, ...document.related.map((related) => `${related.title} ${related.sourcePath}`)]
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    return searchable.includes(normalizedQuery);
  });
  const offset = cursor?.offset ?? 0;
  const items = matched.slice(offset, offset + rawLimit);
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < matched.length
    ? Buffer.from(JSON.stringify({ offset: nextOffset, scope }), "utf8").toString("base64url")
    : null;

  return NextResponse.json({
    ok: true,
    schemaVersion: catalog.schemaVersion,
    query: { q: query || null, category, limit: rawLimit },
    categories: catalog.categories,
    total: matched.length,
    returned: items.length,
    items,
    nextCursor,
  }, {
    headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
  });
}
