import { NextResponse } from "next/server";
import { runDbScreener } from "@/lib/db-screener";
import type { ScreenerRequest } from "@/lib/screener-types";
import { validateScreenerRequest } from "@/lib/screener-validation";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{const body=await request.json();const validationError=validateScreenerRequest(body);if(validationError)return NextResponse.json({ok:false,error:validationError},{status:400});return NextResponse.json({ok:true,results:await runDbScreener(body as ScreenerRequest)});}catch{return NextResponse.json({ok:false,error:"SCREENER_FAILED"},{status:503});}}
