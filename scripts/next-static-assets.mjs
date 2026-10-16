const NEXT_STATIC_SCRIPT_PATTERN = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;

export function extractNextStaticScriptPaths(html) {
  const paths = new Set();
  for (const match of html.matchAll(NEXT_STATIC_SCRIPT_PATTERN)) {
    const source = match[2].replaceAll("&amp;", "&");
    let pathname;
    try {
      pathname = new URL(source, "http://localhost").pathname;
    } catch {
      continue;
    }
    if (/^\/_next\/static\/.*\.js$/i.test(pathname)) paths.add(pathname);
  }
  return [...paths];
}

export function validateNextStaticScriptResponse({ status, contentType, byteLength }) {
  if (status !== 200) return `expected HTTP 200, received ${status}`;
  if (!/(?:java|ecma)script/i.test(contentType ?? "")) return `expected JavaScript content-type, received ${contentType || "missing"}`;
  if (!Number.isFinite(byteLength) || byteLength <= 0) return `expected a non-empty JavaScript body, received ${byteLength} bytes`;
  return null;
}
