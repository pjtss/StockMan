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
  try {
    const body=await request.json();
    const validationError=validateScreenerRequest(body);
    if(validationError)return NextResponse.json({ok:false,error:validationError},{status:400});
    const fingerprint=JSON.stringify(body);
    const cached=completedScans.get(fingerprint);
    if(cached && cached.expiresAt>Date.now()) return NextResponse.json({ok:true,results:cached.results,cache:"HIT"});
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
    return NextResponse.json({ok:true,results,cache:"MISS"});
  }catch(error){
    console.error("[API /screener/run] failed:",error instanceof Error?error.message.slice(0,1000):"unknown error");
    return NextResponse.json({ok:false,error:"SCREENER_FAILED"},{status:503});
  }
}
