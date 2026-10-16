import { describe, expect, it } from "vitest";
import { extractNextStaticScriptPaths, validateNextStaticScriptResponse } from "./next-static-assets.mjs";

describe("standalone Next.js static script smoke helpers", () => {
  it("extracts unique local Next static JavaScript paths from HTML", () => {
    const html = [
      '<script src="/_next/static/chunks/app/charts.js"></script>',
      '<script defer src="/_next/static/chunks/app/charts.js"></script>',
      '<script src="https://analytics.example.test/tracker.js"></script>',
      '<script src="/_next/static/css/app.css"></script>',
      '<script src="/_next/static/chunks/runtime.js?x=1&amp;y=2"></script>',
    ].join("");

    expect(extractNextStaticScriptPaths(html)).toEqual([
      "/_next/static/chunks/app/charts.js",
      "/_next/static/chunks/runtime.js",
    ]);
  });

  it("rejects missing, non-JavaScript, and empty chunk responses", () => {
    expect(validateNextStaticScriptResponse({ status: 404, contentType: "text/html", byteLength: 20 })).toMatch(/HTTP 200/);
    expect(validateNextStaticScriptResponse({ status: 200, contentType: "text/html", byteLength: 20 })).toMatch(/JavaScript content-type/);
    expect(validateNextStaticScriptResponse({ status: 200, contentType: "application/notjavascript", byteLength: 20 })).toMatch(/JavaScript content-type/);
    expect(validateNextStaticScriptResponse({ status: 200, contentType: "application/javascript", byteLength: 0 })).toMatch(/non-empty/);
    expect(validateNextStaticScriptResponse({ status: 200, contentType: "text/javascript; charset=utf-8", byteLength: 12 })).toBeNull();
    expect(validateNextStaticScriptResponse({ status: 200, contentType: " APPLICATION/ECMASCRIPT ; charset=utf-8", byteLength: 12 })).toBeNull();
  });
});
