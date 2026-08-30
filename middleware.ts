import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function requestIdFrom(request: NextRequest) {
  const supplied = request.headers.get("x-request-id")?.trim() || "";
  return REQUEST_ID_PATTERN.test(supplied) ? supplied : crypto.randomUUID();
}

/**
 * Give every API request a correlation id before it reaches a route handler.
 * Route handlers may add more timing headers, but the id is always available
 * to automation history, server logs and the client response.
 */
export function middleware(request: NextRequest, event: NextFetchEvent) {
  const requestId = requestIdFrom(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  const logUrl = new URL("/api/internal/request-log", request.url);
  event.waitUntil(fetch(logUrl, { method: "POST", headers: { "content-type": "application/json", "x-request-log-secret": process.env.REQUEST_LOG_SECRET || "", "x-request-id": requestId, "x-forwarded-for": request.headers.get("x-forwarded-for") || "", "user-agent": request.headers.get("user-agent") || "" }, body: JSON.stringify({ method: request.method, path: request.nextUrl.pathname }) }).catch(() => undefined));
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/internal/request-log).*)"],
};
