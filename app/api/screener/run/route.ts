import { NextResponse } from "next/server";
import { runDbScreener } from "@/lib/db-screener";
import type { ScreenerRequest } from "@/lib/screener-types";
import { validateScreenerRequest } from "@/lib/screener-validation";
export const dynamic="force-dynamic";
const inFlightScans = new Map<string, Promise<Awaited<ReturnType<typeof runDbScreener>>>>();
const completedScans = new Map<string, { expiresAt: number; results: Awaited<ReturnType<typeof runDbScreener>> }>();
const SCREENER_CACHE_TTL_MS = 10_000;
const SCREENER_CACHE_MAX_ENTRIES = 32;

export async function POST(request:Request){
  const startedAt = performance.now();
  const respond = (body: unknown, init?: ResponseInit, cache?: "HIT" | "MISS") => {
    const response = NextResponse.json(body, init);
    response.headers.set("server-timing", `screener;dur=${Math.max(0, Math.round(performance.now() - startedAt))}`);
    if (cache) response.headers.set("x-screener-cache", cache);
    return response;
  };
  try {
    const body=await request.json();
    const validationError=validateScreenerRequest(body);
    if(validationError)return respond({ok:false,error:validationError},{status:400});
    const fingerprint=JSON.stringify(body);
    const cached=completedScans.get(fingerprint);
    if(cached && cached.expiresAt>Date.now()) return respond({ok:true,results:cached.results,cache:"HIT"}, undefined, "HIT");
    if(cached) completedScans.delete(fingerprint);
    let scan=inFlightScans.get(fingerprint);
    if(!scan){
      scan=runDbScreener(body as ScreenerRequest);
      inFlightScans.set(fingerprint,scan);
      void scan.finally(() => { if(inFlightScans.get(fingerprint)===scan) inFlightScans.delete(fingerprint); }).catch(() => undefined);
    }
    const results=await scan;
    completedScans.set(fingerprint,{expiresAt:Date.now()+SCREENER_CACHE_TTL_MS,results});
    while(completedScans.size>SCREENER_CACHE_MAX_ENTRIES){ const oldest=completedScans.keys().next().value; if(oldest) completedScans.delete(oldest); else break; }
    return respond({ok:true,results,cache:"MISS"}, undefined, "MISS");
  }catch(error){
    console.error("[API /screener/run] failed:",error instanceof Error?error.message.slice(0,1000):"unknown error");
    return respond({ok:false,error:"SCREENER_FAILED"},{status:503});
  }
}
