import { NextResponse } from "next/server";
import { runDbScreener } from "@/lib/db-screener";
import type { ScreenerRequest } from "@/lib/screener-types";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{const body=await request.json() as ScreenerRequest; if(body.market && !["KR","US","ALL"].includes(body.market))return NextResponse.json({error:"INVALID_MARKET"},{status:400}); return NextResponse.json({ok:true,results:await runDbScreener(body)});}catch{return NextResponse.json({ok:false,error:"SCREENER_FAILED"},{status:503});}}
