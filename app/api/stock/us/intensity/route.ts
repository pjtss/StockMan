import { NextResponse } from "next/server";
import { fetchUsTradingIntensity } from "@/lib/kis-us";

export async function GET() {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store, max-age=0");

  try {
    const data = await fetchUsTradingIntensity();
    if (data.length === 0) {
      headers.set("x-debug-status", "empty");
      const KIS_APPKEY = process.env.KIS_APPKEY;
      const KIS_APPSECRET = process.env.KIS_APPSECRET;
      if (!KIS_APPKEY || !KIS_APPSECRET) {
        headers.set("x-debug-reason", "KIS API credentials missing. Attempted DB Cache restore but it was also empty.");
      } else {
        headers.set("x-debug-reason", "Real-time KIS US intensity returned 0 items. Possibly outside US market hours (or Yahoo fallback failed) and DB cache is empty.");
      }
    } else {
      headers.set("x-debug-status", "success");
      headers.set("x-debug-reason", "US intensity data loaded successfully.");
    }
    return NextResponse.json(data, { headers });
  } catch (err: any) {
    headers.set("x-debug-status", "error");
    headers.set("x-debug-reason", `Server error: ${err.message || err}`);
    return NextResponse.json({
      error: "Failed to fetch US intensity",
      message: err.message || String(err),
      stack: err.stack
    }, { status: 500, headers });
  }
}

