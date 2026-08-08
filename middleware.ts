import { NextResponse, type NextRequest } from "next/server";

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
export function middleware(request: NextRequest) {
  const requestId = requestIdFrom(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};

